// For each division by 10, add one to exponent to truncate one significant figure
import { Address, BigDecimal, Bytes } from "@graphprotocol/graph-ts/index";
import { Account, AccountCToken } from "../generated/schema";

export const comptrollerAddress = "0x60E8b7a33dEC7A4d70fcc1A502d5F68043cD45a7";
export const priceOracle = "0x38dFd9fF71FcAA2Bfa33A517bC3Bd84c33fd6c18";
export const daiAddress = "0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359";
export const rUSDCAddress = "0xDC90B8d84959A0b04264aE9dE132FDB475093e22";
export const rETHAddress = "0xe1e3F117246D71F6Be1cA6d8807284202D0732bB";
export const USDCAddress = "0x6747Fd27185Db7D5886541Df1CaD5DA68Ae9b4ca";

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
  cTokenStats.totalUnderlyingSupplied = zeroBD;
  cTokenStats.totalUnderlyingSuppliedUSD = zeroBD;
  cTokenStats.totalUnderlyingRedeemed = zeroBD;
  cTokenStats.accountBorrowIndex = zeroBD;
  cTokenStats.totalUnderlyingBorrowed = zeroBD;
  cTokenStats.totalUnderlyingBorrowedUSD = zeroBD;
  cTokenStats.totalUnderlyingRepaid = zeroBD;
  cTokenStats.storedBorrowBalance = zeroBD;
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
