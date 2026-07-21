import { Router } from 'express';
import { asyncHandler, ApiError } from '../../shared/http.js';
import { buildWorkbook } from '../../services/excelService.js';
import * as service from './service.js';

const router = Router();

// Excel export for any report: GET /api/reports/:name/export.xlsx
const EXPORTERS = {
  'cash-flow': (t) => service.cashFlowReport(t),
  'outstanding-vendors': service.outstandingVendors,
  'outstanding-clients': service.outstandingClients,
  'fleet-amortization': service.fleetAmortization,
  'vehicle-utilization': service.vehicleUtilization,
  'vehicle-cost': (t) => service.vehicleCost(t),
  'salary': service.salaryReport,
  'upcoming-payments': (t) => service.upcomingPayments(t),
};
router.get(
  '/reports/:name/export.xlsx',
  asyncHandler(async (req, res) => {
    const fn = EXPORTERS[req.params.name];
    if (!fn) throw new ApiError(404, 'Unknown report');
    const rows = await fn(req.tenantId);
    const wb = await buildWorkbook(req.params.name, rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }),
);

router.get('/dashboard', asyncHandler(async (req, res) => res.json(await service.dashboard(req.tenantId))));
router.get('/reminders', asyncHandler(async (req, res) => res.json(await service.reminders(req.tenantId))));
router.get('/calendar', asyncHandler(async (req, res) => res.json(await service.calendar(req.tenantId, req.query.month))));
router.get('/search', asyncHandler(async (req, res) => res.json(await service.search(req.tenantId, req.query.q))));

router.get('/reports/cash-flow', asyncHandler(async (req, res) => res.json(await service.cashFlowReport(req.tenantId, req.query.from, req.query.to))));
router.get('/reports/outstanding-vendors', asyncHandler(async (req, res) => res.json(await service.outstandingVendors(req.tenantId))));
router.get('/reports/outstanding-clients', asyncHandler(async (req, res) => res.json(await service.outstandingClients(req.tenantId))));
router.get('/reports/fleet-amortization', asyncHandler(async (req, res) => res.json(await service.fleetAmortization(req.tenantId))));
router.get('/reports/vehicle-utilization', asyncHandler(async (req, res) => res.json(await service.vehicleUtilization(req.tenantId))));
router.get('/reports/vehicle-cost', asyncHandler(async (req, res) => res.json(await service.vehicleCost(req.tenantId, req.query.from, req.query.to))));
router.get('/reports/salary', asyncHandler(async (req, res) => res.json(await service.salaryReport(req.tenantId))));
router.get('/reports/upcoming-payments', asyncHandler(async (req, res) => res.json(await service.upcomingPayments(req.tenantId, Number(req.query.days) || 30))));
router.get('/reports/company-statement/:companyId', asyncHandler(async (req, res) => res.json(await service.companyStatement(req.tenantId, Number(req.params.companyId)))));
router.get('/reports/client-statement/:companyId', asyncHandler(async (req, res) => res.json(await service.clientStatement(req.tenantId, Number(req.params.companyId)))));

export default router;
