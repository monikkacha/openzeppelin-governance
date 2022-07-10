const { expect } = require("chai");
const { loadFixture } = require("ethereum-waffle");
const { ethers } = require("hardhat");

describe("Governance", function () {

    const TOKEN_NAME = "GovernanceToken";
    const TOKEN_SYMOBOL = "GT";
    const MIN_DELAY = 3600;
    const GOVERNANCE_FRACTION = 4;
    const GOVERNANCE_DELAY = 1;
    const GOVERNANCE_PERIOD = 5;
    const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
    const FUNCTION = 'store';
    const NEW_VALUE = 10;
    const PROPOSE_DESCRIPTION = 'My proposal number #1 : change value';

    let proposerRole;
    let executorRole;
    let adminRole;
    let firstSigner;
    let anotherAccount;
    let generatedProposalId;

    async function deployGovernanceLockFixture() {
        firstSigner = await ethers.getSigner();
        allAccounts = await ethers.getSigners();

        // Deploy GovernorToken Contract
        const GovernanceToken = await hre.ethers.getContractFactory("GovernanceToken");
        const governanceToken = await GovernanceToken.deploy(TOKEN_NAME, TOKEN_SYMOBOL);
        await governanceToken.deployed();
        const delegateTx = await governanceToken.delegate(firstSigner.address);
        await delegateTx.wait(1);

        // Deploy TimeLock Contract
        const TimeLock = await hre.ethers.getContractFactory("TimeLock");
        const timeLock = await TimeLock.deploy(MIN_DELAY, [], []);
        await timeLock.deployed();

        // Deploy Governace Contract 
        const MyGovernance = await hre.ethers.getContractFactory("MyGovernance");
        const myGovernance = await MyGovernance.deploy(governanceToken.address, timeLock.address, GOVERNANCE_FRACTION, GOVERNANCE_DELAY, GOVERNANCE_PERIOD);
        await myGovernance.deployed();

        // Set up Governance Contract
        proposerRole = timeLock.PROPOSER_ROLE();
        executorRole = timeLock.EXECUTOR_ROLE();
        adminRole = timeLock.TIMELOCK_ADMIN_ROLE();

        const proposerTx = await timeLock.grantRole(proposerRole, myGovernance.address);
        await proposerTx.wait(1);
        const executorTx = await timeLock.grantRole(executorRole, ADDRESS_ZERO);
        await executorTx.wait(1);
        const adminTx = await timeLock.grantRole(executorRole, firstSigner.address);
        await adminTx.wait(1);

        // Deploy Box Contract
        const Box = await hre.ethers.getContractFactory("Box");
        const box = await Box.deploy();
        await box.deployed();

        // Transfer Ownership
        const transferTx = await box.transferOwnership(timeLock.address);
        await transferTx.wait(1);

        return { governanceToken, timeLock, myGovernance, box };
    }

    it("Check for the token", async function () {
        const { governanceToken } = await loadFixture(deployGovernanceLockFixture);
        var balance = await governanceToken.balanceOf(firstSigner.address);
        expect(balance).to.equal(ethers.utils.parseEther('1000000'));
    });

    it("Check for the total supply", async function () {
        const { governanceToken } = await loadFixture(deployGovernanceLockFixture);
        var balance = await governanceToken.totalSupply();
        expect(balance).to.equal(ethers.utils.parseEther('1000000'));
    });

    it("can only be changed through governance", async () => {
        const { box } = await loadFixture(deployGovernanceLockFixture);
        await expect(box.store(55)).to.be.revertedWith("Ownable: caller is not the owner");
    })

    it("Creeate Proposal", async function () {
        const { myGovernance, box } = await loadFixture(deployGovernanceLockFixture);
        const encodedFunction = await box.interface.encodeFunctionData(FUNCTION, [NEW_VALUE]);
        const proposeTx = await myGovernance.propose(
            [box.address],
            [0],
            [encodedFunction],
            PROPOSE_DESCRIPTION
        );

        await moveBlocks(GOVERNANCE_DELAY + 1);

        const proposeReceipt = await proposeTx.wait(1);
        const proposalId = proposeReceipt.events[0].args.proposalId;

        // check for event emitted from the smart contract
        expect(proposeReceipt.events[0].event).to.equal('ProposalCreated');

        // const proposalState = await myGovernance.state(proposalId);
        // console.log('ProposalState :', proposalState);

        generatedProposalId = proposalId;
    });

    it("Vote on proposal with tokens", async () => {
        const { myGovernance } = await loadFixture(deployGovernanceLockFixture);
        const voteWay = 1;
        const reason = 'I like the idea';
        const voteTx = await myGovernance.castVoteWithReason(generatedProposalId, voteWay, reason);
        const voteReceipt = await voteTx.wait(1);
        expect(voteReceipt.events[0].event).to.equal('VoteCast');

        // const proposalState = await myGovernance.state(generatedProposalId);
        // console.log('proposalState ', proposalState);

        await moveBlocks(GOVERNANCE_PERIOD + 1);
    })


    it("Check for box value", async () => {
        const { box } = await loadFixture(deployGovernanceLockFixture);
        const value = await box.retrieve();
        expect(ethers.utils.formatEther(value)).to.equal('0.0');
    });

    it("Queue action", async () => {

        const { myGovernance, box } = await loadFixture(deployGovernanceLockFixture);
        // const proposalState = await myGovernance.state(generatedProposalId);
        // console.log('proposalState ', proposalState);

        const encodedFunction = await box.interface.encodeFunctionData(FUNCTION, [NEW_VALUE]);
        const descriptionHash = ethers.utils.id(PROPOSE_DESCRIPTION)
        const queueTx = await myGovernance.queue(
            [box.address],
            [0],
            [encodedFunction],
            descriptionHash
        );
        const queueReceipt = await queueTx.wait(1);
        expect(queueReceipt.events[1].event).to.equal('ProposalQueued');
        await moveTime(MIN_DELAY + 1)
        await moveBlocks(1)
    })

    it("Execute action", async () => {
        const { myGovernance, box } = await loadFixture(deployGovernanceLockFixture);
        const encodedFunction = await box.interface.encodeFunctionData(FUNCTION, [NEW_VALUE]);
        const descriptionHash = ethers.utils.id(PROPOSE_DESCRIPTION)
        const executeTx = await myGovernance.execute(
            [box.address],
            [0],
            [encodedFunction],
            descriptionHash
        );
        const executeReceipt = await executeTx.wait(1);
        expect(executeReceipt.events[0].event).to.equal('ProposalExecuted');
    })

    it("Check for box value after proposal", async () => {
        const { box } = await loadFixture(deployGovernanceLockFixture);
        const value = await box.retrieve();
        expect(value).to.equal('10');
    });

    async function moveBlocks(timeToBeDelayed) {
        for (let index = 0; index < timeToBeDelayed; index++) {
            await network.provider.request({
                method: "evm_mine",
                params: [],
            })
        }
    }

    async function moveTime(amount) {
        await network.provider.send("evm_increaseTime", [amount])
    }
});

