import assert from "node:assert/strict";
import { buildProjectKickoffPlan, seedProjectKickoffPlan } from "../src/lib/project-kickoff.ts";

class MockDb {
  constructor() {
    this.tables = {
      teams: [
        { id: "team-product", name: "Product" },
        { id: "team-design", name: "Design" },
        { id: "team-engineering", name: "Engineering" },
        { id: "team-marketing", name: "Marketing" },
        { id: "team-qa", name: "QA" },
      ],
      team_members: [
        { team_id: "team-product", agent_id: "agent-product", role: "lead" },
        { team_id: "team-design", agent_id: "agent-design", role: "lead" },
        { team_id: "team-engineering", agent_id: "agent-engineering", role: "lead" },
        { team_id: "team-marketing", agent_id: "agent-marketing", role: "lead" },
        { team_id: "team-qa", agent_id: "agent-qa", role: "lead" },
      ],
      sprints: [],
      sprint_items: [],
    };
  }

  from(table) {
    return new MockQuery(this, table);
  }
}

class MockQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.sorts = [];
    this.limitValue = null;
    this.insertRows = null;
    this.selectColumns = null;
  }

  select(columns) {
    this.selectColumns = columns;
    return this;
  }

  insert(payload) {
    this.insertRows = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  ilike(column, value) {
    const normalized = String(value).toLowerCase();
    this.filters.push((row) => String(row[column] ?? "").toLowerCase() === normalized);
    return this;
  }

  order(column, options = {}) {
    this.sorts.push({ column, ascending: options.ascending !== false });
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  async single() {
    if (this.insertRows) {
      const created = this.insertRows.map((row) => ({ id: `${this.table}-${this.db.tables[this.table].length + 1}`, ...row }));
      this.db.tables[this.table].push(...created);
      return { data: created[0], error: null };
    }

    const rows = this.#rows();
    return { data: rows[0] ?? null, error: null };
  }

  async maybeSingle() {
    return this.single();
  }

  then(resolve, reject) {
    return Promise.resolve({ data: this.#rows(), error: null }).then(resolve, reject);
  }

  #rows() {
    let rows = [...this.db.tables[this.table]];
    for (const filter of this.filters) rows = rows.filter(filter);
    for (const sort of this.sorts.reverse()) {
      rows.sort((a, b) => {
        const left = a[sort.column];
        const right = b[sort.column];
        if (left === right) return 0;
        if (left == null) return 1;
        if (right == null) return -1;
        return sort.ascending ? (left > right ? 1 : -1) : (left < right ? 1 : -1);
      });
    }
    if (typeof this.limitValue === "number") rows = rows.slice(0, this.limitValue);
    return rows;
  }
}

const intake = {
  shape: "saas-product",
  context: ["customer-facing", "new-initiative"],
  capabilities: ["strategy", "ux-ui", "frontend", "backend-data", "qa-optimization"],
  stage: "planning",
  confidence: "not-sure",
  goals: "Turn the intake into a plan and first build slice.",
};

const plan = buildProjectKickoffPlan({
  projectName: "Command Center V1",
  type: "product_build",
  intake,
});

assert.equal(plan[0].key, "discover");
assert.equal(plan[0].status, "active");
assert.equal(plan[0].gateStatus, "not_requested");
assert.ok(plan.some((phase) => phase.key === "design"));
assert.ok(plan.some((phase) => phase.key === "build"));
assert.ok(plan.some((phase) => phase.key === "validate"));
assert.ok(plan.every((phase) => phase.tasks.length >= 1));

const db = new MockDb();
const seeded = await seedProjectKickoffPlan(db, {
  projectId: "project-1",
  projectName: "Command Center V1",
  type: "product_build",
  intake,
  startPosition: 1,
});

assert.equal(seeded.phases.length, plan.length);
assert.equal(db.tables.sprints.length, plan.length);
assert.equal(db.tables.sprint_items.length, plan.reduce((count, phase) => count + phase.tasks.length, 0));
assert.equal(db.tables.sprints[0].status, "active");
assert.equal(db.tables.sprints[0].approval_gate_status, "not_requested");
assert.ok(db.tables.sprints.slice(1).every((phase) => phase.status === "draft"));
assert.ok(db.tables.sprint_items.every((task) => task.sprint_id));
assert.ok(db.tables.sprint_items.every((task) => task.task_type));
assert.ok(db.tables.sprint_items.every((task) => task.owner_team_id));
assert.ok(db.tables.sprint_items.every((task) => task.task_metadata.phase_key));
assert.ok(db.tables.sprint_items.some((task) => task.assignee_agent_id === "agent-engineering"));

console.log("verify-project-kickoff: ok", {
  phases: db.tables.sprints.map((phase) => ({ name: phase.name, status: phase.status, gate: phase.approval_gate_status })),
  taskCount: db.tables.sprint_items.length,
});
