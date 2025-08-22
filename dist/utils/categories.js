"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPENSE_CATS = exports.INCOME_CATS = void 0;
exports.isIncomeCat = isIncomeCat;
exports.isExpenseCat = isExpenseCat;
exports.INCOME_CATS = [
    "薪資", "零用錢", "投資", "獎金", "退款", "麻將", "其他收入"
];
exports.EXPENSE_CATS = [
    "早餐", "午餐", "晚餐", "宵夜", "飲料", "交通", "醫療", "娛樂", "麻將",
    "購物", "訂閱", "禮物", "投資買入", "其他支出"
];
function isIncomeCat(c) {
    return exports.INCOME_CATS.includes(c);
}
function isExpenseCat(c) {
    return exports.EXPENSE_CATS.includes(c);
}
