import path from "node:path";
import { app } from "electron";
import { DatabaseSync } from "node:sqlite";
//#region electron/db/connection.ts
var Db = class {
	raw;
	constructor(location) {
		this.raw = new DatabaseSync(location);
	}
	prepare(sql) {
		return this.raw.prepare(sql);
	}
	exec(sql) {
		this.raw.exec(sql);
	}
	/** Mirror better-sqlite3's `pragma('key = value')` via an exec'd PRAGMA statement. */
	pragma(statement) {
		this.raw.exec(`PRAGMA ${statement}`);
	}
	/**
	* Mirror better-sqlite3's `transaction(fn)`: returns a function that runs `fn`
	* inside BEGIN/COMMIT, rolling back (and rethrowing) on error.
	*/
	transaction(fn) {
		const raw = this.raw;
		const wrapped = (...args) => {
			raw.exec("BEGIN");
			try {
				const result = fn(...args);
				raw.exec("COMMIT");
				return result;
			} catch (err) {
				try {
					raw.exec("ROLLBACK");
				} catch {}
				throw err;
			}
		};
		return wrapped;
	}
	close() {
		this.raw.close();
	}
};
var db = null;
function getDbPath() {
	if (process.env.NODE_ENV === "test") return ":memory:";
	try {
		return path.join(app.getPath("userData"), "nursery.db");
	} catch {
		return path.join(process.cwd(), "nursery.db");
	}
}
function initDb(dbPath = getDbPath()) {
	if (db) return db;
	db = new Db(dbPath);
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");
	db.pragma("synchronous = NORMAL");
	db.pragma("temp_store = MEMORY");
	return db;
}
function getDb() {
	if (!db) return initDb();
	return db;
}
function closeDb() {
	if (db) {
		db.close();
		db = null;
	}
}
//#endregion
export { getDb as n, initDb as r, closeDb as t };

//# sourceMappingURL=connection-BvJpTvbB.js.map