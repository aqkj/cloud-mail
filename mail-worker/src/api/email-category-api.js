import app from '../hono/hono';
import result from '../model/result';
import emailCategoryService from '../service/email-category-service';

app.get('/category/list', async (c) => {
	const data = await emailCategoryService.list(c);
	return c.json(result.ok(data));
})

app.post('/category/add', async (c) => {
	const data = await emailCategoryService.add(c, await c.req.json());
	return c.json(result.ok(data));
})

app.put('/category/update', async (c) => {
	const data = await emailCategoryService.update(c, await c.req.json());
	return c.json(result.ok(data));
})

app.delete('/category/delete', async (c) => {
	await emailCategoryService.delete(c, c.req.query());
	return c.json(result.ok());
})

app.get('/category/rule/list', async (c) => {
	const data = await emailCategoryService.ruleList(c, c.req.query('categoryId'));
	return c.json(result.ok(data));
})

app.post('/category/rule/add', async (c) => {
	const data = await emailCategoryService.addRule(c, await c.req.json());
	return c.json(result.ok(data));
})

app.put('/category/rule/update', async (c) => {
	const data = await emailCategoryService.updateRule(c, await c.req.json());
	return c.json(result.ok(data));
})

app.delete('/category/rule/delete', async (c) => {
	await emailCategoryService.deleteRule(c, c.req.query());
	return c.json(result.ok());
})

app.post('/category/reclassify', async (c) => {
	const data = await emailCategoryService.reclassify(c, await c.req.json());
	return c.json(result.ok(data));
})
