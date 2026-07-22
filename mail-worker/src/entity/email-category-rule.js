import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const emailCategoryRule = sqliteTable('email_category_rule', {
	ruleId: integer('rule_id').primaryKey({ autoIncrement: true }),
	categoryId: integer('category_id').notNull(),
	field: text('field').notNull(),
	matchType: text('match_type').notNull(),
	keyword: text('keyword').notNull(),
	caseSensitive: integer('case_sensitive').notNull().default(0),
	enabled: integer('enabled').notNull().default(1),
	priority: integer('priority').notNull().default(0),
	createTime: text('create_time').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export default emailCategoryRule;
