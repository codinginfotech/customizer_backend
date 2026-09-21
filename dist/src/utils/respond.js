"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.created = created;
exports.noContent = noContent;
exports.buildMeta = buildMeta;
function ok(res, data, meta, status = 200) {
    return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}
function created(res, data) {
    return ok(res, data, undefined, 201);
}
function noContent(res) {
    return res.status(204).send();
}
function buildMeta(page, pageSize, total) {
    return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
//# sourceMappingURL=respond.js.map