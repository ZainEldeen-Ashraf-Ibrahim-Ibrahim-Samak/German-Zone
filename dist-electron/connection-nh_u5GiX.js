import { app } from "electron";
import path from "node:path";
import Database from "better-sqlite3";
//#region electron/db/connection.ts
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
	db = new Database(dbPath);
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");
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

//# sourceMappingURL=connection-nh_u5GiX.js.map