# Security Specification: Nokite Hub Team Management

## Data Invariants
1. **Multi-tenancy**: All financial data (`transactions`, `debts`, `bills`) MUST belong to a `tenantId`.
2. **Access Hierarchy**:
   - `Owner`: Full read/write access to their tenant's data. Can manage `team_members`.
   - `Viewer`: Read-only access to specific collections (`transactions`, `bills`). **Forbidden** from accessing `debts` and `team_members` (except reading their own record).
3. **Identity**: Document IDs for `team_members` correspond to user emails for fast lookup.

## The Dirty Dozen (Attack Payloads)
1. **Unauthorized Read**: Authenticated user attempts to read transactions of another `tenantId`.
2. **Viewer Write**: User with `viewer` role attempts to create a transaction.
3. **Ghost Update**: Viewer attempts to update their own role to `owner`.
4. **Tenant Hijack**: Owner attempts to change `userId` of a transaction to someone else's tenant.
5. **PII Leak**: Viewer attempts to list all `team_members` of the tenant.
6. **Orphaned Write**: Creating a transaction with a non-existent `tenantId` (though this hub uses auto-created tenants).
7. **Role Escalation**: Viewer attempts to delete another team member.
8. **Shadow Field**: Creating a transaction with an unauthorized `isAdmin` field.
9. **Debt Access**: Viewer attempts to read the `debts` collection.
10. **Cross-Tenant List**: Authenticated user queries all transactions without filtering by `tenantId`.
11. **Account Takeover**: User attempts to create a `team_members` record for an email they don't own.
12. **System Poisoning**: Sending a 1MB string in a transaction description.
