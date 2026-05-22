# Observability guidelines

- Every new service or job defines its SLO and its failure signal.
- Dashboards answer: is it up, is it fast, is it correct?
- Alerts are actionable; every alert has an owner and a runbook link.
- Logs, metrics, and traces share a correlation ID.
- A deploy is not complete until its signal is visible.
- Rollback is a first-class operation and is tested.
- Cost is an operational signal; flag unbounded growth.
