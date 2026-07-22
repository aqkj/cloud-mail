import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const emailCategoryRel = sqliteTable('email_category_rel', {
	categoryId: integer('category_id').notNull(),
	emailId: integer('email_id').notNull(),
	ruleId: integer('rule_id').notNull().default(0),
	createTime: text('create_time').notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => ({
	pk: primaryKey({ columns: [table.categoryId, table.emailId] })
}));

export default emailCategoryRel;
