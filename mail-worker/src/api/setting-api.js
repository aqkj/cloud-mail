import app from '../hono/hono';
import result from '../model/result';
import settingService from '../service/setting-service';
import domainService from '../service/domain-service';

app.put('/setting/set', async (c) => {
	await settingService.set(c, await c.req.json());
	return c.json(result.ok());
});

app.get('/setting/query', async (c) => {
	const setting = await settingService.get(c);
	return c.json(result.ok(setting));
});

app.get('/setting/websiteConfig', async (c) => {
	const setting = await settingService.websiteConfig(c);
	return c.json(result.ok(setting));
})

app.put('/setting/setBackground', async (c) => {
	const key = await settingService.setBackground(c, await c.req.json());
	return c.json(result.ok(key));
});

app.delete('/setting/deleteBackground', async (c) => {
	await settingService.deleteBackground(c);
	return c.json(result.ok());
});

app.put('/setting/setBlacklist', async (c) => {
	const setting = await settingService.setBlacklist(c, await c.req.json());
	return c.json(result.ok(setting));
})

app.get('/setting/domain/list', async (c) => {
	const data = await domainService.info(c);
	return c.json(result.ok(data));
})

app.post('/setting/domain/add', async (c) => {
	const params = await c.req.json();
	const data = await domainService.add(c, domainService.parseInput(params.domains || params.domain || params.text));
	return c.json(result.ok(data));
})

app.post('/setting/domain/delete', async (c) => {
	const params = await c.req.json();
	const data = await domainService.delete(c, domainService.parseInput(params.domains || params.domain || params.text));
	return c.json(result.ok(data));
})

app.put('/setting/domain/replace', async (c) => {
	const params = await c.req.json();
	const data = await domainService.save(c, domainService.parseInput(params.domains || params.domain || params.text));
	return c.json(result.ok(data));
})

app.put('/setting/domain/ensureKv', async (c) => {
	const data = await domainService.ensureKv(c);
	return c.json(result.ok(data));
})
