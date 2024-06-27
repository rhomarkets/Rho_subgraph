// For each division by 10, add one to exponent to truncate one significant figure
import { Address, BigDecimal, Bytes } from "@graphprotocol/graph-ts/index";
import { Account, AccountCToken } from "../generated/schema";

export const comptrollerAddress = "0x8a67AB98A291d1AEA2E1eB0a79ae4ab7f2D76041"; //UNITROLLER
export const priceOracle = "0x3E1AbD0731c9397f92beC0fbA6918628013F7C6F";
export const rUSDCAddress = "0xAE1846110F72f2DaaBC75B7cEEe96558289EDfc5";
export const rETHAddress = "0x639355f34Ca9935E0004e30bD77b9cE2ADA0E692";

export function exponentToBigDecimal(decimals: i32): BigDecimal {
  let bd = BigDecimal.fromString("1");
  for (let i = 0; i < decimals; i++) {
    bd = bd.times(BigDecimal.fromString("10"));
  }
  return bd;
}

export let mantissaFactor = 18;
export let cTokenDecimals = 8;
export let mantissaFactorBD: BigDecimal = exponentToBigDecimal(18);
export let cTokenDecimalsBD: BigDecimal = exponentToBigDecimal(8);
export let zeroBD = BigDecimal.fromString("0");

export function createAccountCToken(
  cTokenStatsID: string,
  symbol: string,
  account: string,
  marketID: string
): AccountCToken {
  let cTokenStats = new AccountCToken(cTokenStatsID);
  cTokenStats.symbol = symbol;
  cTokenStats.market = marketID;
  cTokenStats.account = account;
  cTokenStats.transactionHashes = [];
  cTokenStats.transactionTimes = [];
  cTokenStats.accrualBlockNumber = 0;
  cTokenStats.cTokenBalance = zeroBD;
  cTokenStats.cTokenBalanceUSD = zeroBD;
  cTokenStats.totalUnderlyingSupplied = zeroBD;
  cTokenStats.totalUnderlyingRedeemed = zeroBD;
  cTokenStats.accountBorrowIndex = zeroBD;
  cTokenStats.totalUnderlyingBorrowed = zeroBD;
  cTokenStats.totalUnderlyingRepaid = zeroBD;
  cTokenStats.storedBorrowBalance = zeroBD;
  cTokenStats.storedBorrowBalanceUSD = zeroBD;
  cTokenStats.enteredMarket = false;
  return cTokenStats;
}

export function createAccount(accountID: string): Account {
  let account = new Account(accountID);
  account.countLiquidated = 0;
  account.countLiquidator = 0;
  account.hasBorrowed = false;
  account.totalBorrowValueInEth = zeroBD;
  account.totalCollateralValueInEth = zeroBD;
  account.liquitity = zeroBD;
  account.shortfall = zeroBD;
  account.save();
  return account;
}

export function updateCommonCTokenStats(
  marketID: string,
  marketSymbol: string,
  accountID: string,
  txHash: Bytes,
  timestamp: i32,
  blockNumber: i32
): AccountCToken {
  let cTokenStatsID = marketID.concat("-").concat(accountID);
  let cTokenStats = AccountCToken.load(cTokenStatsID);
  if (cTokenStats == null) {
    cTokenStats = createAccountCToken(
      cTokenStatsID,
      marketSymbol,
      accountID,
      marketID
    );
  }
  let txHashes = cTokenStats.transactionHashes;
  txHashes.push(txHash);
  cTokenStats.transactionHashes = txHashes;
  let txTimes = cTokenStats.transactionTimes;
  txTimes.push(timestamp);
  cTokenStats.transactionTimes = txTimes;
  cTokenStats.accrualBlockNumber = blockNumber;
  return cTokenStats as AccountCToken;
}
