import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const emailCategory = sqliteTable('email_category', {
	categoryId: integer('category_id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	color: text('color').notNull().default(''),
	icon: text('icon').notNull().default(''),
	sort: integer('sort').notNull().default(0),
	enabled: integer('enabled').notNull().default(1),
	createTime: text('create_time').notNull().default(sql`CURRENT_TIMESTAMP`),
	updateTime: text('update_time').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export default emailCategory;
