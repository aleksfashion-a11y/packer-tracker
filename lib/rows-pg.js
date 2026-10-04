// Драйвер таблиц для PostgreSQL (см. lib/collections.js — там описано, зачем он нужен
// и как проверяется). Все таблицы одинаковой формы:
//   project  — имя проекта (в одной базе может жить несколько проектов)
//   id       — ключ элемента
//   pos      — порядок элемента в списке
//   data     — сам элемент целиком (JSONB)
//   + отдельные столбцы для отбора и сортировки (дата, сотрудник, время...)
//
// Текстовые столбцы объявлены с COLLATE "C" (сравнение "побайтно"): так сортировка и
// сравнение дат/ключей не зависят от языковых настроек базы и совпадают с эталонным
// драйвером символ в символ.

const { SPECS } = require("./collections");

function pgDriver(pool, project) {
  const tableOf = (name) => {
    const spec = SPECS[name];
    if (!spec || !/^[a-z_][a-z0-9_]*$/.test(spec.table)) throw new Error("неизвестный раздел " + name);
    return spec.table;
  };
  const colsOf = (name) => Object.keys(SPECS[name].cols || {});
  const checkCol = (name, col) => {
    if (col !== "pos" && !colsOf(name).includes(col)) throw new Error("неизвестный столбец " + col);
    return col;
  };
  // bigint приходит из базы строкой — для сравнения с эталоном это не важно (в выдачу столбцы не попадают)
  const toRow = (r) => ({ id: r.id, pos: Number(r.pos), data: JSON.parse(r.d) });

  function where(name, f, params) {
    const parts = ["project = $1"];
    for (const [c, v] of Object.entries(f.eq || {})) {
      checkCol(name, c);
      if (v === null) parts.push(`${c} IS NULL`);
      else { params.push(String(v)); parts.push(`${c} = $${params.length}`); }
    }
    for (const [c, list] of Object.entries(f.in || {})) {
      checkCol(name, c); params.push(list.map(String)); parts.push(`${c} = ANY($${params.length}::text[])`);
    }
    for (const [op, sign] of [["gte", ">="], ["lte", "<="]]) {
      for (const [c, v] of Object.entries(f[op] || {})) {
        checkCol(name, c);
        const isNum = SPECS[name].cols[c][0] === "bigint";
        params.push(isNum ? Math.trunc(Number(v)) : String(v));
        parts.push(`${c} ${sign} $${params.length}`);
      }
    }
    return parts.join(" AND ");
  }

  const session = (q, forUpdate) => ({
    async all(name) {
      const { rows } = await q(`SELECT id, pos, data::text AS d FROM ${tableOf(name)} WHERE project = $1 ORDER BY pos, id`, [project]);
      return rows.map(toRow);
    },
    async byIds(name, ids) {
      if (!ids.length) return [];
      const { rows } = await q(`SELECT id, pos, data::text AS d FROM ${tableOf(name)} WHERE project = $1 AND id = ANY($2::text[]) ORDER BY pos, id${forUpdate ? " FOR UPDATE" : ""}`, [project, ids.map(String)]);
      return rows.map(toRow);
    },
    async query(name, f = {}) {
      const params = [project];
      const w = where(name, f, params);
      const order = f.orderBy && f.orderBy !== "pos" ? checkCol(name, f.orderBy) : "pos";
      // пустые значения всегда в конце — и при прямом, и при обратном порядке
      let sql = `SELECT id, pos, data::text AS d FROM ${tableOf(name)} WHERE ${w} ORDER BY ${order} ${f.desc ? "DESC" : "ASC"} NULLS LAST, id ${f.desc ? "DESC" : "ASC"}`;
      if (f.limit) { params.push(Math.trunc(f.limit)); sql += ` LIMIT $${params.length}`; }
      if (f.offset) { params.push(Math.trunc(f.offset)); sql += ` OFFSET $${params.length}`; }
      const { rows } = await q(sql, params);
      return rows.map(toRow);
    },
    async count(name, f = {}) {
      const params = [project];
      const { rows } = await q(`SELECT count(*)::int AS n FROM ${tableOf(name)} WHERE ${where(name, f, params)}`, params);
      return rows[0].n;
    },
    async insert(name, row) { await this.insertMany(name, [row]); },
    async insertMany(name, list) {
      const cols = colsOf(name);
      const BATCH = 200;
      for (let i = 0; i < list.length; i += BATCH) {
        const params = [project];
        const tuples = [];
        for (const row of list.slice(i, i + BATCH)) {
          const p = [];
          params.push(String(row.id)); p.push(`$${params.length}`);
          params.push(row.pos); p.push(`$${params.length}`);
          params.push(JSON.stringify(row.data)); p.push(`$${params.length}::jsonb`);
          for (const c of cols) { params.push(row.cols && row.cols[c] !== undefined ? row.cols[c] : null); p.push(`$${params.length}`); }
          tuples.push(`($1, ${p.join(", ")})`);
        }
        await q(`INSERT INTO ${tableOf(name)} (project, id, pos, data${cols.map((c) => ", " + c).join("")}) VALUES ${tuples.join(", ")}`, params);
      }
    },
    async update(name, id, data, colVals) {
      const cols = colsOf(name);
      const params = [project, String(id), JSON.stringify(data)];
      const sets = ["data = $3::jsonb", "updated_at = now()"];
      for (const c of cols) { params.push(colVals && colVals[c] !== undefined ? colVals[c] : null); sets.push(`${c} = $${params.length}`); }
      await q(`UPDATE ${tableOf(name)} SET ${sets.join(", ")} WHERE project = $1 AND id = $2`, params);
    },
    async setPos(name, id, pos) {
      await q(`UPDATE ${tableOf(name)} SET pos = $3 WHERE project = $1 AND id = $2`, [project, String(id), pos]);
    },
    async remove(name, ids) {
      if (!ids.length) return;
      await q(`DELETE FROM ${tableOf(name)} WHERE project = $1 AND id = ANY($2::text[])`, [project, ids.map(String)]);
    },
    async clear(name) { await q(`DELETE FROM ${tableOf(name)} WHERE project = $1`, [project]); },
    async bounds(name) {
      const { rows } = await q(`SELECT min(pos) AS mn, max(pos) AS mx FROM ${tableOf(name)} WHERE project = $1`, [project]);
      return { min: rows[0].mn === null ? null : Number(rows[0].mn), max: rows[0].mx === null ? null : Number(rows[0].mx) };
    },
    async posOf(name, id) {
      const { rows } = await q(`SELECT pos FROM ${tableOf(name)} WHERE project = $1 AND id = $2`, [project, String(id)]);
      return rows.length ? Number(rows[0].pos) : null;
    },
    async nextPos(name, pos) {
      const { rows } = await q(`SELECT min(pos) AS p FROM ${tableOf(name)} WHERE project = $1 AND pos > $2`, [project, pos]);
      return rows[0].p === null ? null : Number(rows[0].p);
    },
    async bump(name) {
      await q(`INSERT INTO pt_versions (project, name, ver) VALUES ($1, $2, 1) ON CONFLICT (project, name) DO UPDATE SET ver = pt_versions.ver + 1`, [project, name]);
    },
    async version(name) {
      const { rows } = await q(`SELECT ver::text AS v FROM pt_versions WHERE project = $1 AND name = $2`, [project, name]);
      return rows.length ? rows[0].v : "0";
    },
  });

  const direct = session((sql, params) => pool.query(sql, params), false);
  return {
    ...direct,
    name: "PostgreSQL",
    // Создаёт таблицы и индексы, если их ещё нет (и добавляет новые столбцы к существующим)
    async ensure(names) {
      await pool.query(`CREATE TABLE IF NOT EXISTS pt_versions (project TEXT NOT NULL, name TEXT NOT NULL, ver BIGINT NOT NULL DEFAULT 0, PRIMARY KEY (project, name))`);
      for (const name of names) {
        const table = tableOf(name);
        const cols = SPECS[name].cols || {};
        await pool.query(`CREATE TABLE IF NOT EXISTS ${table} (
          project TEXT NOT NULL,
          id TEXT COLLATE "C" NOT NULL,
          pos DOUBLE PRECISION NOT NULL DEFAULT 0,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (project, id)
        )`);
        for (const [c, [type]] of Object.entries(cols)) {
          if (!/^[a-z_][a-z0-9_]*$/.test(c)) throw new Error("недопустимое имя столбца " + c);
          await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${c} ${type === "bigint" ? "BIGINT" : 'TEXT COLLATE "C"'}`);
          await pool.query(`CREATE INDEX IF NOT EXISTS ${table}_${c}_idx ON ${table} (project, ${c})`);
        }
        await pool.query(`CREATE INDEX IF NOT EXISTS ${table}_pos_idx ON ${table} (project, pos)`);
      }
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(session((sql, params) => client.query(sql, params), true));
        await client.query("COMMIT");
        return result;
      } catch (e) {
        try { await client.query("ROLLBACK"); } catch (e2) { /* соединение уже потеряно */ }
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

module.exports = { pgDriver };
