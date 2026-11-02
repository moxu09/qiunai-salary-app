import test from 'node:test';
import assert from 'node:assert/strict';
import { HR_THEMES,canUseHrTheme,isHrThemeOnSale,verifiedThemePayment } from '../lib/hrThemes.mjs';

test('paid color themes are five permanent ten-dollar products',()=>{
 const colors=HR_THEMES.filter(t=>t.color);assert.equal(colors.length,5);
 for(const theme of colors){assert.equal(theme.price,10);assert.equal(theme.saleEndsAt,undefined);assert.equal(isHrThemeOnSale(theme,new Date('2100-01-01')),true);}
});
test('Halloween sells through the end of November in Taipei time',()=>{
 const theme=HR_THEMES.find(t=>t.key==='halloween-2026');assert.equal(theme.price,50);
 assert.equal(isHrThemeOnSale(theme,new Date('2026-11-30T15:59:59.999Z')),true);
 assert.equal(isHrThemeOnSale(theme,new Date('2026-11-30T16:00:00Z')),false);
});
test('only free or explicitly owned catalog themes can be applied',()=>{
 assert.equal(canUseHrTheme('qiunai'),true);assert.equal(canUseHrTheme('deepnight'),true);
 for(const theme of HR_THEMES.filter(t=>t.price>0)){assert.equal(canUseHrTheme(theme.key),false);assert.equal(canUseHrTheme(theme.key,[theme.key]),true);}
 assert.equal(canUseHrTheme('unlisted',['unlisted']),false);
});
test('a paid seasonal entitlement remains usable after the sale end',()=>{
 assert.equal(canUseHrTheme('halloween-2026',['halloween-2026']),true);
});
const payment={MerchantID:'merchant',RtnCode:1,SimulatePaid:0,OrderInfo:{MerchantTradeNo:'HT0123456789ABCDEF01',TradeNo:'GATEWAY1',TradeAmt:10}};
test('verified theme payments bind the merchant, trade number and integer amount',()=>{
 assert.deepEqual(verifiedThemePayment(payment,'merchant'),{tradeNo:payment.OrderInfo.MerchantTradeNo,gatewayTradeNo:'GATEWAY1',amount:10});
 assert.throws(()=>verifiedThemePayment(payment,'other'));
 for(const invalid of [{MerchantTradeNo:'QI0123456789ABCDEF01'},{TradeNo:''},{TradeAmt:0},{TradeAmt:10.5},{TradeAmt:'NaN'}])
  assert.throws(()=>verifiedThemePayment({...payment,OrderInfo:{...payment.OrderInfo,...invalid}},'merchant'));
});
test('pending, failed, simulated and missing simulation markers never unlock',()=>{
 for(const patch of [{RtnCode:2},{RtnCode:10300066},{RtnCode:0},{SimulatePaid:1},{SimulatePaid:undefined}])
  assert.equal(verifiedThemePayment({...payment,...patch},'merchant'),null);
});

test('gateway lookup requires paid status and matching merchant, order and amount',async()=>{
 const {confirmedThemeQuery}=await import('../lib/hrThemes.mjs');
 const order={merchant_id:'merchant',merchant_trade_no:payment.OrderInfo.MerchantTradeNo,amount:10};
 const response={...payment,OrderInfo:{...payment.OrderInfo,TradeStatus:'1'}};
 assert.equal(confirmedThemeQuery(response,order).amount,10);
 assert.equal(confirmedThemeQuery({...response,OrderInfo:{...response.OrderInfo,TradeStatus:'0'}},order),null);
 for(const change of [{TradeAmt:1},{MerchantTradeNo:'HTOTHER'},{TradeNo:''}])assert.throws(()=>confirmedThemeQuery({...response,OrderInfo:{...response.OrderInfo,...change}},order));
 assert.throws(()=>confirmedThemeQuery({...response,MerchantID:'other'},order));
});

test('only a verified definitive failure releases an unpaid checkout',async()=>{
 const {failedThemePayment}=await import('../lib/hrThemes.mjs');
 const order={merchant_id:'merchant',merchant_trade_no:payment.OrderInfo.MerchantTradeNo,amount:10};
 assert.equal(failedThemePayment({...payment,RtnCode:10100251},order),true);
 for(const patch of [{RtnCode:10300066},{RtnCode:1},{RtnCode:undefined},{RtnCode:10100251,SimulatePaid:1},{RtnCode:10100251,MerchantID:'other'}])assert.equal(failedThemePayment({...payment,...patch},order),false);
 assert.equal(failedThemePayment({...payment,RtnCode:10100251,OrderInfo:{...payment.OrderInfo,TradeAmt:1}},order),false);
});
