export const INCOME_CATS = [
  "薪資", "零用錢", "投資", "獎金", "退款", "麻將",  "其他收入"
] as const;

export const EXPENSE_CATS = [
  "早餐", "午餐", "晚餐", "宵夜", "飲料", "交通", "醫療", "娛樂", "麻將", 
  "購物", "訂閱", "禮物", "投資買入", "其他支出" 
] as const;

export function isIncomeCat(c: string) {
  return (INCOME_CATS as readonly string[]).includes(c);
}
export function isExpenseCat(c: string) {
  return (EXPENSE_CATS as readonly string[]).includes(c);
}
