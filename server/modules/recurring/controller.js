import { recurringSchema } from './validation.js';
import { asyncHandler, ApiError } from '../../shared/http.js';
import * as service from './service.js';

export const list = asyncHandler(async (req, res) => res.json(await service.list(req.tenantId)));
export const create = asyncHandler(async (req, res) =>
  res.status(201).json(await service.create(req.tenantId, recurringSchema.parse(req.body))),
);
export const update = asyncHandler(async (req, res) =>
  res.json(await service.update(req.tenantId, Number(req.params.id), recurringSchema.partial().parse(req.body))),
);
export const remove = asyncHandler(async (req, res) => {
  const d = await service.remove(req.tenantId, Number(req.params.id));
  if (!d) throw new ApiError(404, 'Template not found');
  res.json({ id: d.id });
});
