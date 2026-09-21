"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catchAsync = void 0;
/** Wraps async route handlers so rejections reach the error middleware. */
const catchAsync = (fn) => (req, res, next) => {
    fn(req, res, next).catch(next);
};
exports.catchAsync = catchAsync;
//# sourceMappingURL=catchAsync.js.map