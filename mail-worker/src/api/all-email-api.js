import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';

app.get('/allEmail/list', async (c) => {
	const data = await emailService.allList(c, c.req.query());
	return c.json(result.ok(data));
})

app.delete('/allEmail/delete', async (c) => {
	const list = await emailService.physicsDelete(c, c.req.query());
	return c.json(result.ok(list));
})

app.delete('/allEmail/batchDelete', async (c) => {
	const data = await emailService.batchDelete(c, c.req.query());
	return c.json(result.ok(data));
})

app.get('/allEmail/autoClean', async (c) => {
	const data = await emailService.getAutoClean(c);
	return c.json(result.ok(data));
})

app.put('/allEmail/autoClean', async (c) => {
	const data = await emailService.setAutoClean(c, await c.req.json());
	return c.json(result.ok(data));
})

app.get('/allEmail/latest', async (c) => {
	const list = await emailService.allEmailLatest(c, c.req.query());
	return c.json(result.ok(list));
})
