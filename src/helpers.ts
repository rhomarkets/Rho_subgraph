// For each division by 10, add one to exponent to truncate one significant figure
import { Address, BigDecimal, Bytes } from "@graphprotocol/graph-ts/index";
import { Account, AccountCToken } from "../generated/schema";

export const comptrollerAddress = "0x06d083a4BA72E5DdEDA79C13ac9Ec574ADBbB459";
export const priceOracle = "0xfCe1176758F77a1423B3f0076Dac0ceC35f1fd7E";
export const daiAddress = "0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359";
export const rUSDCAddress = "0xFC9b58a8cf8EA1183010394c418BAA0F48a9D7f8";
export const rETHAddress = "0xECF8E05f965edA0c4b237092657FD04542aaC5F1";
export const USDCAddress = "0x580740ceB40789137e0631B7D126FB197Bf070f9";

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
