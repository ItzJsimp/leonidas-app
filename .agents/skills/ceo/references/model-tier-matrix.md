# Live Model Selection Guide

Model names and provider instances change. Use the current Leonidas capability catalog.

| Role         | Selection                                                                 | Responsibility                                          |
| ------------ | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| Orchestrator | Current thread model; use a frontier-capable model for high-risk planning | Plan, interfaces, delegation, integration, final review |
| Worker       | Exact provider instance and model advertised by orchestrator_capabilities | One bounded research or implementation slice            |
| Reviewer     | Orchestrator by default; independent reviewer only when useful            | Diff audit, acceptance checks, corrections              |

1. Query orchestrator_capabilities before choosing a child.
2. Use the exact advertised model ID and provider instance.
3. Check tool support and context needs.
4. Consider quota, latency, reliability, request count, token use, and expected review effort.
5. For an exact-model evaluation, pin the request model and verify returned model/provider in activity records.
6. If a target is missing or incompatible, record it as unavailable and stop that comparison arm.

Delegation is useful when specialization or parallel execution repays extra calls and review. It is not the default for every task.
