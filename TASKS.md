# Tasks - Frontend Migration

## Active Session

### Frontend Migration: antd → shadcn/Tailwind

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Remove antd dependencies | ✅ Done |
| 2a | Create missing shadcn components (Loading, Tabs) | ✅ Done |
| 2b | Migrate pages off antd | 🔄 In Progress |
| 3 | Create shared Page component | Pending |
| 4 | Clean up Refine usage | Pending |
| 5 | Set up Tailwind theme | Pending |
| 6 | Verify build and test | Pending |

#### Phase 2b - Pages to Migrate

| Page | Status | Notes |
|------|--------|-------|
| Dashboard | ✅ Done | Template example |
| ConnectorsList | ✅ Done | |
| PositionsList | ✅ Done | |
| TradesList | ✅ Done | |
| StrategiesList | ✅ Done | |
| RulesList | ✅ Done | |
| ConnectorsCreate | ✅ Done | |
| ConnectorsEdit | ✅ Done | Clean |
| RulesCreate | ✅ Done | |
| StrategiesCreate | ✅ Done | |
| Settings | ✅ Done | Clean |
| Login | ✅ Done | Clean |
| RulesEdit | ⬜ | Has Refine - Phase 4 |
| StrategiesEdit | ⬜ | Has Refine - Phase 4 |

## Completed

- 2026-08-03: Phase 1 - Remove antd dependencies
- 2026-08-03: Phase 2a - Create Loading, Tabs, Checkbox components
- 2026-08-03: 10 pages migrated to shadcn/Tailwind
- Phase 2b complete except Refine pages
