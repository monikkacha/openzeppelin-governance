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

    let proposerRole;
    let executorRole;
    let adminRole;
    let firstSigner;

    async function deployGovernanceLockFixture() {
        firstSigner = await ethers.getSigner();

        // Deploy GovernorToken Contract
        const GovernanceToken = await hre.ethers.getContractFactory("GovernanceToken");
        const governanceToken = await GovernanceToken.deploy(TOKEN_NAME, TOKEN_SYMOBOL);
        await governanceToken.deployed();

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
});
