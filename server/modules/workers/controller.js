import { createWorkerSchema, updateWorkerSchema } from '../../schemas/workers.js';
import { asyncHandler } from '../../shared/http.js';
import * as service from './service.js';

export const list = asyncHandler(async (req, res) =>
  res.json(await service.list(req.tenantId, { q: req.query.q })),
);
export const getById = asyncHandler(async (req, res) =>
  res.json(await service.detail(req.tenantId, Number(req.params.id))),
);
export const create = asyncHandler(async (req, res) =>
  res.status(201).json(await service.create(req.tenantId, createWorkerSchema.parse(req.body))),
);
export const update = asyncHandler(async (req, res) =>
  res.json(await service.update(req.tenantId, Number(req.params.id), updateWorkerSchema.parse(req.body))),
);
export const remove = asyncHandler(async (req, res) =>
  res.json(await service.remove(req.tenantId, Number(req.params.id))),
);
