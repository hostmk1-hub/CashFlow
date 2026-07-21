import { Router } from 'express';
import { asyncHandler } from '../../shared/http.js';
import * as service from './service.js';

const router = Router();

router.get('/dashboard', asyncHandler(async (req, res) => res.json(await service.dashboard(req.tenantId))));
router.get('/reminders', asyncHandler(async (req, res) => res.json(await service.reminders(req.tenantId))));
router.get('/calendar', asyncHandler(async (req, res) => res.json(await service.calendar(req.tenantId, req.query.month))));
router.get('/search', asyncHandler(async (req, res) => res.json(await service.search(req.tenantId, req.query.q))));

router.get('/reports/cash-flow', asyncHandler(async (req, res) => res.json(await service.cashFlowReport(req.tenantId, req.query.from, req.query.to))));
router.get('/reports/outstanding-vendors', asyncHandler(async (req, res) => res.json(await service.outstandingVendors(req.tenantId))));
router.get('/reports/outstanding-clients', asyncHandler(async (req, res) => res.json(await service.outstandingClients(req.tenantId))));
router.get('/reports/fleet-amortization', asyncHandler(async (req, res) => res.json(await service.fleetAmortization(req.tenantId))));
router.get('/reports/vehicle-utilization', asyncHandler(async (req, res) => res.json(await service.vehicleUtilization(req.tenantId))));

export default router;
