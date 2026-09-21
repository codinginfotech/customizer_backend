"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const zod_1 = require("zod");
const apiError_1 = require("../utils/apiError");
/** Validates and coerces request parts with Zod; replaces them with parsed values. */
function validate(schemas) {
    return (req, _res, next) => {
        try {
            if (schemas.params)
                req.params = schemas.params.parse(req.params);
            if (schemas.query)
                req.query = schemas.query.parse(req.query);
            if (schemas.body)
                req.body = schemas.body.parse(req.body);
            return next();
        }
        catch (err) {
            if (err instanceof zod_1.ZodError) {
                const details = err.errors.map((e) => ({
                    path: e.path.join('.'),
                    message: e.message,
                }));
                return next(apiError_1.ApiError.badRequest(details[0]?.message || 'Invalid request', 'VALIDATION_ERROR', details));
            }
            return next(err);
        }
    };
}
//# sourceMappingURL=validate.middleware.js.map