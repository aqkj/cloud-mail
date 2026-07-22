import orm from '../entity/orm';
import email from '../entity/email';
import { attConst, emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, lt, count, asc, sql, ne, or, lte, gte } from 'drizzle-orm';
import { star } from '../entity/star';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import fileUtils from '../utils/file-utils';
import { Resend } from 'resend';
import attService from './att-service';
import { parseHTML } from 'linkedom';
import userService from './user-service';
import roleService from './role-service';
import user from '../entity/user';
import starService from './star-service';
import dayjs from 'dayjs';
import kvConst from '../const/kv-const';
import { t } from '../i18n/i18n'
import domainUtils from '../utils/domain-uitls';
import verifyUtils from '../utils/verify-utils';
import account from "../entity/account";
import { att } from '../entity/att';
import telegramService from './telegram-service';
import { containsText, equalsText, startsWithText } from '../utils/sql-utils';
import domainService from './domain-service';
import cloudflareEmailService from './cloudflare-email-service';

const MAX_CLOUDFLARE_RECIPIENTS = 50;
const MAX_INLINE_ATTACHMENTS = 10;
const MAX_FILE_ATTACHMENTS = 10;

const emailService = {

	pushCondition(conditions, condition) {
		if (condition) {
			conditions.push(condition);
		}
	},

	async list(c, params, userId) {

		let { emailId, type, accountId, size, timeSort, allReceive } = params;

		size = Number(size);
		emailId = Number(emailId);
		timeSort = Number(timeSort);
		accountId = Number(accountId);
		allReceive = Number(allReceive);

		if (!size || Number.isNaN(size)) {
			size = 20;
		}

		if (size > 50) {
			size = 50;
		}

		if (size < 1) {
			size = 1;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		if (this.isLiteQuery(params)) {
			return await this.listLite(c, { emailId, type, accountId, size, timeSort, allReceive }, userId);
		}

		const query = orm(c)
			.select({
				...email,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, userId)
				)
			).leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.userId, userId),
					timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId),
					eq(email.type, type),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL)
				)
			);

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();

		const totalQuery = orm(c).select({ total: count() }).from(email)
			.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.userId, userId),
					eq(email.type, type),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL)
				)
		).get();

		const latestEmailQuery = orm(c).select().from(email).where(
			and(
				allReceive ? eq(1,1) : eq(email.accountId, accountId),
				eq(email.userId, userId),
				eq(email.type, type),
				eq(email.isDel, isDel.NORMAL)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		list = list.map(item => ({
			...item,
			isStar: item.starId != null ? 1 : 0
		}));


		await this.emailAddAtt(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: accountId,
				userId: userId,
			}
		}

		return { list, total: totalRow.total, latestEmail };
	},

	async listLite(c, params, userId) {
		const { emailId, type, accountId, size, timeSort, allReceive } = params;

		let query = orm(c)
			.select(this.liteEmailSelect())
			.from(email);

		if (allReceive) {
			query = query.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			);
		}

		query = query.where(
			and(
				allReceive ? eq(account.isDel, isDel.NORMAL) : eq(email.accountId, accountId),
				eq(email.userId, userId),
				timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId),
				eq(email.type, type),
				eq(email.isDel, isDel.NORMAL)
			)
		);

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const list = await query.limit(size).all();
		const latestEmail = (timeSort ? list.at(-1) : list[0]) || {
			emailId: 0,
			accountId: accountId,
			userId: userId,
		};

		return { list, total: list.length, latestEmail };
	},

	async delete(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);
		await orm(c).update(email).set({ isDel: isDel.DELETE }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
	},

	receive(c, params, cidAttList, r2domain) {
		params.content = this.imgReplace(params.content, cidAttList, r2domain)
		return orm(c).insert(email).values({ ...params }).returning().get();
	},

	//邮件发送
	async send(c, params, userId) {

		let {
			accountId, //发送账号id
			name, //发件人名字
			sendType, //发件类型
			emailId, //邮件id，如果是回复邮件会带
			receiveEmail, //收件人邮箱
			text, //邮件纯文本
			content, //邮件内容
			subject, //邮件标题
			attachments = [] //附件
		} = params;

		receiveEmail = Array.isArray(receiveEmail) ? receiveEmail : [];
		attachments = Array.isArray(attachments) ? attachments : [];

		const { resendTokens, r2Domain, send } = await settingService.query(c);

		let { imageDataList, html } = await attService.toImageUrlHtml(c, content);

		if (imageDataList.length > MAX_INLINE_ATTACHMENTS) {
			throw new BizError(t('imageAttLimit'));
		}

		if (attachments.length > MAX_FILE_ATTACHMENTS) {
			throw new BizError(t('attLimit'));
		}

		//判断是否关闭发件功能
		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		//判断接收方是不是全部为站内邮箱
		const internalFlags = await Promise.all(
			receiveEmail.map(email => domainService.hasDomain(c, emailUtils.getDomain(email)))
		);
		const allInternal = internalFlags.every(Boolean);

		if (c.env.admin !== userRow.email) {

			//发件被禁用
			if (roleRow.sendType === 'ban') {
				throw new BizError(t('bannedSend'), 403);
			}

			//发件被禁用
			if (roleRow.sendType === 'internal' && !allInternal) {
				throw new BizError(t('onlyInternalSend'), 403);
			}

		}

		//如果不是管理员，权限设置了发送次数
		if (c.env.admin !== userRow.email && roleRow.sendCount) {

			if (userRow.sendCount >= roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLimit'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLimit'), 403);
			}

			if (userRow.sendCount + receiveEmail.length > roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLack'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLack'), 403);
			}

		}

		const accountRow = await accountService.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== userId) {
			throw new BizError(t('sendEmailNotCurUser'));
		}

		if (c.env.admin !== userRow.email) {
			//用户没有这个域名的使用权限
			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		const domain = emailUtils.getDomain(accountRow.email);
		const resendToken = resendTokens[domain];
		const useCloudflareEmail = cloudflareEmailService.hasBinding(c.env);

		if (!allInternal && useCloudflareEmail && receiveEmail.length > MAX_CLOUDFLARE_RECIPIENTS) {
			throw new BizError(t('tooManyRecipients', { count: MAX_CLOUDFLARE_RECIPIENTS }));
		}

		//如果接收方存在站外邮箱，又没有发信服务
		if (!useCloudflareEmail && !resendToken && !allInternal) {
			throw new BizError(t('noSendProvider'));
		}

		//没有发件人名字自动截取
		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		let emailRow = {
			messageId: null
		};

		//如果是回复邮件
		if (sendType === 'reply') {

			emailRow = await this.selectById(c, emailId);

			if (!emailRow) {
				throw new BizError(t('notExistEmailReply'));
			}

		}

		let sendResult = {};

		//存在站外邮箱时，如果配置了 Cloudflare Email Service 就优先使用，否则使用 Resend
		if (!allInternal) {

			if (useCloudflareEmail) {
				sendResult = await this.sendByCloudflareEmail(c, {
					name,
					accountEmail: accountRow.email,
					receiveEmail,
					subject,
					text,
					html,
					attachments: [...imageDataList, ...attachments],
					sendType,
					messageId: emailRow.messageId
				});
			} else {
				sendResult = await this.sendByResend(resendToken, {
					name,
					accountEmail: accountRow.email,
					receiveEmail,
					subject,
					text,
					html,
					attachments: [...imageDataList, ...attachments],
					sendType,
					messageId: emailRow.messageId
				});
			}

		}

		const { data, error } = sendResult;


		if (error) {
			throw new BizError(error.message);
		}

		imageDataList = imageDataList.map(item => ({...item, contentId: `<${item.contentId}>`}))

		//把图片标签cid标签切换会通用url
		html = this.imgReplace(html, imageDataList, r2Domain);

		//封装数据保存到数据库
		const emailData = {};
		emailData.sendEmail = accountRow.email;
		emailData.name = name;
		emailData.subject = subject;
		emailData.content = html;
		emailData.text = text;
		emailData.accountId = accountId;
		emailData.status = emailConst.status.SENT;
		emailData.type = emailConst.type.SEND;
		emailData.userId = userId;
		emailData.resendEmailId = data?.id;

		const recipient = [];

		receiveEmail.forEach(item => {
			recipient.push({ address: item, name: '' });
		});

		emailData.recipient = JSON.stringify(recipient);

		if (sendType === 'reply') {
			emailData.inReplyTo = emailRow.messageId;
			emailData.relation = emailRow.messageId;
		}

		//如果权限有发送次数增加用户发送次数
		if (roleRow.sendCount && roleRow.sendType !== 'internal') {
			await userService.incrUserSendCount(c, receiveEmail.length, userId);
		}

		//保存到数据库并返回结果
		const emailResult = await orm(c).insert(email).values(emailData).returning().get();

		//保存内嵌附件
		if (imageDataList.length > 0) {
			await attService.saveArticleAtt(c, imageDataList, userId, accountId, emailResult.emailId);
		}

		//保存普通附件
		if (attachments?.length > 0) {
			await attService.saveSendAtt(c, attachments, userId, accountId, emailResult.emailId);
		}

		const attList = await attService.selectByEmailIds(c, [emailResult.emailId]);
		emailResult.attList = attList;

		//如果全是站内接收方，直接写入数据库
		if (allInternal) {
			await this.HandleOnSiteEmail(c, receiveEmail, emailResult, attList);
		}

		const dateStr = dayjs().format('YYYY-MM-DD');
		let daySendTotal = await c.env.kv.get(kvConst.SEND_DAY_COUNT + dateStr);

		//记录每天发件次数统计
		if (!daySendTotal) {
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(receiveEmail.length), { expirationTtl: 60 * 60 * 24 });
		} else  {
			daySendTotal = Number(daySendTotal) + receiveEmail.length
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(daySendTotal), { expirationTtl: 60 * 60 * 24 });
		}

		return [ emailResult ];
	},

	async sendByCloudflareEmail(c, params) {
		const cfEmail = cloudflareEmailService.binding(c.env);
		const sendForm = {
			from: { email: params.accountEmail, name: params.name },
			to: [...params.receiveEmail],
			subject: params.subject,
			replyTo: { email: params.accountEmail, name: params.name }
		};

		if (params.text) {
			sendForm.text = params.text;
		}

		if (params.html) {
			sendForm.html = params.html;
		}

		const attachments = await this.toCloudflareAttachments(params.attachments);
		if (attachments.length > 0) {
			sendForm.attachments = attachments;
		}

		if (params.sendType === 'reply' && params.messageId) {
			sendForm.headers = {
				'In-Reply-To': params.messageId,
				References: params.messageId
			};
		}

		try {
			const result = await cfEmail.send(sendForm);
			return {
				data: {
					id: result.messageId
				}
			};
		} catch (error) {
			return {
				error: {
					code: error?.code,
					message: cloudflareEmailService.errorMessage(error)
				}
			};
		}
	},

	async sendByResend(resendToken, params) {
		const resend = new Resend(resendToken);

		const sendForm = {
			from: `${params.name} <${params.accountEmail}>`,
			to: [...params.receiveEmail],
			subject: params.subject,
			text: params.text,
			html: params.html,
			attachments: await this.toResendAttachments(params.attachments)
		};

		if (params.sendType === 'reply') {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		return await resend.emails.send(sendForm);
	},

	async toCloudflareAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentBase64(attachment);
			if (!content) {
				continue;
			}

			const item = {
				content,
				filename: attachment.filename,
				type: attachment.mimeType || attachment.contentType || attachment.type || 'application/octet-stream',
				disposition: attachment.contentId ? 'inline' : 'attachment'
			};

			if (attachment.contentId) {
				item.contentId = attachment.contentId.replace(/^<|>$/g, '');
			}

			result.push(item);
		}

		return result;
	},

	async toResendAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentBase64(attachment);
			if (!content) {
				continue;
			}

			result.push({
				...attachment,
				content,
				contentType: attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream'
			});
		}

		return result;
	},

	async toArrayBufferAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentArrayBuffer(attachment);
			if (!content) {
				continue;
			}

			result.push({ ...attachment, content });
		}

		return result;
	},

	async toAttachmentBase64(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return content.replace(/\s+/g, '');
		}

		const arrayBuffer = await this.toAttachmentArrayBuffer(attachment);
		if (!arrayBuffer) {
			return null;
		}

		const bytes = new Uint8Array(arrayBuffer);
		let binary = '';

		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}

		return btoa(binary);
	},

	async toAttachmentArrayBuffer(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (content instanceof ArrayBuffer) {
			return content;
		}

		if (content instanceof Uint8Array) {
			return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return fileUtils.base64ToUint8Array(content.replace(/\s+/g, '')).buffer;
		}

		return content;
	},

	//处理站内邮件发送
	async HandleOnSiteEmail(c, receiveEmail, sendEmailData, attList) {

		const { noRecipient  } = await settingService.query(c);

		//查询所有收件人账号信息
		let accountList = await orm(c).select().from(account).where(inArray(account.email, receiveEmail)).all();

		//查询所有收件人权限身份
		const userIds = accountList.map(accountRow => accountRow.userId);
		let roleList = await roleService.selectByUserIds(c, userIds);

		//封装数据库准备保存到数据库
		const emailDataList = [];

		for (const email of receiveEmail) {

			//把发件人邮件改成收件
			const emailValues = {...sendEmailData}
			emailValues.status = emailConst.status.RECEIVE;
			emailValues.type = emailConst.type.RECEIVE;
			emailValues.toEmail = email;
			emailValues.toName = emailUtils.getName(email);
			emailValues.emailId = null;

			const accountRow = accountList.find(accountRow => accountRow.email === email);

			//如果收件人存在就把邮件信息改成收件人的
			if (accountRow) {

				//设置给收件人保存
				emailValues.userId = accountRow.userId;
				emailValues.accountId = accountRow.accountId;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.RECEIVE;

				const roleRow = roleList.find(roleRow => roleRow.userId === accountRow.userId);

				let { banEmail, availDomain } = roleRow;

				//如果收件人没有这个域名的使用权限和有邮件拦截，就把邮件改为拒收状态
				if (email !== c.env.admin) {

					if (!roleService.hasAvailDomainPerm(availDomain, email)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is not authorized to use this domain.`;
					} else if(roleService.isBanEmail(banEmail, sendEmailData.sendEmail)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is disabled from receiving emails.`;
					}

				}

				emailDataList.push(emailValues);

			} else {

				//设置无收件人邮件信息
				emailValues.userId = 0;
				emailValues.accountId = 0;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.NOONE;

				//如果无人收件关闭改为拒收
				if (noRecipient === settingConst.noRecipient.CLOSE) {
					emailValues.status = emailConst.status.BOUNCED;
					emailValues.message = `Recipient not found: <${email}>`;
				}

				emailDataList.push(emailValues);

			}

		}

		//保存邮件
		const receiveEmailList = emailDataList.filter(emailRow => emailRow.status === emailConst.status.RECEIVE || emailRow.status === emailConst.status.NOONE);

		for (const emailData of receiveEmailList) {

			const emailRow = await orm(c).insert(email).values(emailData).returning().get();
			await this.putLatestReceiveCache(c, emailRow);

			//设置附件保存
			for (const attRow of attList) {
				const attValues = {...attRow};
				attValues.emailId = emailRow.emailId;
				attValues.accountId = emailRow.accountId;
				attValues.userId = emailRow.userId;
				attValues.attId = null;
				await orm(c).insert(att).values(attValues).run();
			}

		}

		const bouncedEmail = emailDataList.find(emailRow => emailRow.status === emailConst.status.BOUNCED);


		let status = emailConst.status.DELIVERED;
		let message = ''
		//如果有拒收邮件，就把发件人的邮件改成拒收
		if (bouncedEmail) {
			const messageJson = { message: bouncedEmail.message };
			message = JSON.stringify(messageJson);
			status = emailConst.status.BOUNCED;
		}

		await orm(c).update(email).set({ status, message: message }).where(eq(email.emailId, sendEmailData.emailId)).run();

	},

	imgReplace(content, cidAttList, r2domain) {

		if (!content) {
			return ''
		}

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		const useAtts = []

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('cid:') && cidAttList) {

				const cid = src.replace(/^cid:/, '');
				const attCidIndex = cidAttList.findIndex(cidAtt => cidAtt.contentId.replace(/^<|>$/g, '') === cid);

				if (attCidIndex > -1) {
					const cidAtt = cidAttList[attCidIndex];
					img.setAttribute('src', '{{domain}}' + cidAtt.key);
					useAtts.push(cidAtt)
				}

			}

			r2domain = domainUtils.toOssDomain(r2domain)

			if (src && src.startsWith(r2domain + '/')) {
				img.setAttribute('src', src.replace(r2domain + '/', '{{domain}}'));
			}

		}

		useAtts.forEach(att => {
			att.type = attConst.type.EMBED
		})

		return document.toString();
	},

	selectById(c, emailId) {
		return orm(c).select().from(email).where(
			and(eq(email.emailId, emailId),
				eq(email.isDel, isDel.NORMAL)))
			.get();
	},

	async latest(c, params, userId) {
		let { emailId, accountId, allReceive, size } = params;
		emailId = Number(emailId);
		accountId = Number(accountId);
		allReceive = Number(allReceive);
		size = Number(size);

		if (!emailId || Number.isNaN(emailId)) {
			emailId = 0;
		}

		if (!size || Number.isNaN(size)) {
			size = 20;
		}

		if (size > 20) {
			size = 20;
		}

		if (size < 1) {
			size = 1;
		}

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		const cachedList = await this.latestFromCache(c, { emailId, accountId, allReceive, size }, userId, params);
		if (cachedList) {
			return cachedList;
		}

		const liteQuery = this.isLiteQuery(params);
		const selectFields = liteQuery ? this.liteEmailSelect() : {...email};
		const skipAccountJoin = liteQuery && !allReceive;
		let query = orm(c).select(selectFields).from(email);

		if (!skipAccountJoin) {
			query = query.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			);
		}

		query = query.where(
			and(
				gt(email.emailId, emailId),
				eq(email.userId, userId),
				eq(email.isDel, isDel.NORMAL),
				skipAccountJoin ? eq(email.accountId, accountId) : and(
					eq(account.isDel, isDel.NORMAL),
					allReceive ? eq(1,1) : eq(email.accountId, accountId)
				),
				eq(email.type, emailConst.type.RECEIVE)
			))
			.orderBy(desc(email.emailId))
			.limit(size);

		let list = await query.all();

		if (this.shouldLoadAtt(params)) {
			await this.emailAddAtt(c, list);
		}

		return list;
	},

	isLiteQuery(params) {
		const lite = params.lite ?? params.fields ?? params.onlyCode;
		return ['1', 'true', 'lite', 'code'].includes(String(lite).toLowerCase());
	},

	useLatestCache(params) {
		return this.isLiteQuery(params) && ['1', 'true', 'kv', 'cache'].includes(String(params.cache ?? params.hot ?? '0').toLowerCase());
	},

	useLatestCacheOnly(params) {
		return ['1', 'true', 'kv', 'cache'].includes(String(params.cacheOnly ?? params.kvOnly ?? '0').toLowerCase());
	},

	async latestFromCache(c, params, userId, rawParams) {
		const cacheOnly = this.useLatestCacheOnly(rawParams);

		if (!this.useLatestCache(rawParams)) {
			return cacheOnly ? [] : null;
		}

		const { emailId, accountId, allReceive, size } = params;
		if (size !== 1) {
			return cacheOnly ? [] : null;
		}

		if (!c.env.kv) {
			return cacheOnly ? [] : null;
		}

		const key = allReceive ? this.latestUserCacheKey(userId) : this.latestAccountCacheKey(userId, accountId);
		const emailRow = await c.env.kv.get(key, { type: 'json' });

		if (!emailRow) {
			return cacheOnly ? [] : null;
		}

		if (!emailRow || emailRow.emailId <= emailId) {
			return [];
		}

		return [emailRow];
	},

	shouldLoadAtt(params) {
		if (this.isLiteQuery(params) && params.withAtt == null) {
			return false;
		}
		return !['0', 'false'].includes(String(params.withAtt ?? '1').toLowerCase());
	},

	liteEmailSelect() {
		return {
			emailId: email.emailId,
			accountId: email.accountId,
			userId: email.userId,
			sendEmail: email.sendEmail,
			name: email.name,
			subject: email.subject,
			code: email.code,
			text: email.text,
			toEmail: email.toEmail,
			toName: email.toName,
			type: email.type,
			status: email.status,
			unread: email.unread,
			createTime: email.createTime,
			isDel: email.isDel
		};
	},

	latestAccountCacheKey(userId, accountId) {
		return kvConst.EMAIL_LATEST_ACCOUNT + userId + ':' + accountId;
	},

	latestUserCacheKey(userId) {
		return kvConst.EMAIL_LATEST_USER + userId;
	},

	latestToCacheKey(toEmail) {
		return kvConst.EMAIL_LATEST_TO + String(toEmail || '').trim().toLowerCase();
	},

	toLiteEmailRow(emailRow) {
		return {
			emailId: emailRow.emailId,
			accountId: emailRow.accountId,
			userId: emailRow.userId,
			sendEmail: emailRow.sendEmail,
			name: emailRow.name,
			subject: emailRow.subject,
			code: emailRow.code,
			text: emailRow.text,
			toEmail: emailRow.toEmail,
			toName: emailRow.toName,
			type: emailRow.type,
			status: emailRow.status,
			unread: emailRow.unread,
			createTime: emailRow.createTime,
			isDel: emailRow.isDel
		};
	},

	toPublicLatestEmailRow(emailRow) {
		return {
			emailId: emailRow.emailId,
			code: emailRow.code,
			subject: emailRow.subject,
			text: emailRow.text,
			content: emailRow.content,
			toEmail: emailRow.toEmail,
			createTime: emailRow.createTime
		};
	},

	async putLatestReceiveCache(c, emailRow) {
		if (!c.env.kv || !emailRow) {
			return;
		}

		if (emailRow.type !== emailConst.type.RECEIVE || emailRow.isDel !== isDel.NORMAL) {
			return;
		}

		const cacheableStatus = [emailConst.status.RECEIVE, emailConst.status.NOONE].includes(emailRow.status);
		if (!cacheableStatus) {
			return;
		}

		const options = { expirationTtl: 60 * 15 };
		const cacheWrites = [];

		if (emailRow.toEmail) {
			cacheWrites.push(this.putNewerLatestCache(c, this.latestToCacheKey(emailRow.toEmail), this.toPublicLatestEmailRow(emailRow), options));
		}

		if (emailRow.status === emailConst.status.RECEIVE && emailRow.userId > 0 && emailRow.accountId > 0) {
			const cacheRow = this.toLiteEmailRow(emailRow);
			cacheWrites.push(
				this.putNewerLatestCache(c, this.latestAccountCacheKey(emailRow.userId, emailRow.accountId), cacheRow, options),
				this.putNewerLatestCache(c, this.latestUserCacheKey(emailRow.userId), cacheRow, options)
			);
		}

		await Promise.all(cacheWrites);
	},

	async putNewerLatestCache(c, key, emailRow, options) {
		const oldRow = await c.env.kv.get(key, { type: 'json' });
		if (oldRow && oldRow.emailId > emailRow.emailId) {
			return;
		}
		await c.env.kv.put(key, JSON.stringify(emailRow), options);
	},

	async publicLatestByToEmail(c, params) {
		const toEmail = verifyUtils.normalizeEmail(params.toEmail);
		const sinceEmailId = Number(params.emailId || params.sinceEmailId || 0);
		const useCache = !['0', 'false'].includes(String(params.cache ?? '1').toLowerCase());
		const cacheOnly = this.useLatestCacheOnly(params);

		if (!verifyUtils.isEmail(toEmail)) {
			throw new BizError(t('notEmail'));
		}

		if (useCache && c.env.kv) {
			const emailRow = await c.env.kv.get(this.latestToCacheKey(toEmail), { type: 'json' });
			if (emailRow && emailRow.emailId > sinceEmailId) {
				return [emailRow];
			}
			if (emailRow && emailRow.emailId <= sinceEmailId) {
				return [];
			}
			if (cacheOnly) {
				return [];
			}
		} else if (cacheOnly) {
			return [];
		}

		return await orm(c)
			.select({
				emailId: email.emailId,
				code: email.code,
				subject: email.subject,
				text: email.text,
				content: email.content,
				toEmail: email.toEmail,
				createTime: email.createTime
			})
			.from(email)
			.where(and(
				sql`${email.toEmail} COLLATE NOCASE = ${toEmail}`,
				eq(email.type, emailConst.type.RECEIVE),
				eq(email.isDel, isDel.NORMAL),
				inArray(email.status, [emailConst.status.RECEIVE, emailConst.status.NOONE]),
				gt(email.emailId, sinceEmailId)
			))
			.orderBy(desc(email.emailId))
			.limit(1)
			.all();
	},

	async physicsDelete(c, params) {
		let { emailIds } = params;
		emailIds = emailIds.split(',').map(Number);
		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
	},

	async physicsDeleteUserIds(c, userIds) {
		await attService.removeByUserIds(c, userIds);
		await orm(c).delete(email).where(inArray(email.userId, userIds)).run();
	},

	updateEmailStatus(c, params) {
		const { status, resendEmailId, message } = params;
		return orm(c).update(email).set({
			status: status,
			message: message
		}).where(eq(email.resendEmailId, resendEmailId)).returning().get();
	},

	async selectUserEmailCountList(c, userIds, type, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: email.userId,
				count: count(email.emailId)
			})
			.from(email)
			.where(and(
				inArray(email.userId, userIds),
				eq(email.type, type),
				eq(email.isDel, del),
				ne(email.status, emailConst.status.SAVING),
			))
			.groupBy(email.userId);
		return result;
	},

	async allList(c, params) {

		let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort } = params;

		size = Number(size);

		emailId = Number(emailId);
		timeSort = Number(timeSort);

		if (size > 50) {
			size = 50;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		const conditions = [];

		if (type === 'send') {
			conditions.push(eq(email.type, emailConst.type.SEND));
		}

		if (type === 'receive') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE));
		}

		if (type === 'delete') {
			conditions.push(eq(email.isDel, isDel.DELETE));
		}

		if (type === 'noone') {
			conditions.push(eq(email.status, emailConst.status.NOONE));
		}

		if (userEmail) {
			this.pushCondition(conditions, containsText(user.email, userEmail));
		}

		if (accountEmail) {
			const toEmailCondition = containsText(email.toEmail, accountEmail);
			const sendEmailCondition = containsText(email.sendEmail, accountEmail);
			conditions.push(
				or(
					toEmailCondition,
					sendEmailCondition,
				)
			)
		}

		if (name) {
			this.pushCondition(conditions, containsText(email.name, name));
		}

		if (subject) {
			this.pushCondition(conditions, containsText(email.subject, subject));
		}

		conditions.push(ne(email.status, emailConst.status.SAVING));

		const countConditions = [...conditions];

		if (timeSort) {
			conditions.unshift(gt(email.emailId, emailId));
		} else {
			conditions.unshift(lt(email.emailId, emailId));
		}

		const query = orm(c).select({ ...email, userEmail: user.email })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...conditions));

		const queryCount = orm(c).select({ total: count() })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...countConditions));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = await query.limit(size).all();
		const totalQuery = await queryCount.get();
		const latestEmailQuery = await orm(c).select().from(email)
			.where(and(
				eq(email.type, emailConst.type.RECEIVE),
				ne(email.status, emailConst.status.SAVING)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		await this.emailAddAtt(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: 0,
				userId: 0,
			}
		}

		return { list: list, total: totalRow.total, latestEmail };
	},

	async allEmailLatest(c, params) {

		const { emailId } = params;

		let list = await orm(c).select({...email, userEmail: user.email}).from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.type, emailConst.type.RECEIVE),
					ne(email.status, emailConst.status.SAVING)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);

		return list;
	},

	async emailAddAtt(c, list) {

		const emailIds = list.map(item => item.emailId);

		if (emailIds.length > 0) {

			const attList = await attService.selectByEmailIds(c, emailIds);

			list.forEach(emailRow => {
				const atts = attList.filter(attRow => attRow.emailId === emailRow.emailId);
				emailRow.attList = atts;
			});
		}
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.userId, userId)).run();
	},

	async completeReceive(c, status, emailId) {
		return await orm(c).update(email).set({
			isDel: isDel.NORMAL,
			status: status
		}).where(eq(email.emailId, emailId)).returning().get();
	},

	async completeReceiveAll(c) {
		await c.env.db.prepare(`UPDATE email as e SET status = ${emailConst.status.RECEIVE} WHERE status = ${emailConst.status.SAVING} AND EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
		await c.env.db.prepare(`UPDATE email as e SET status = ${emailConst.status.NOONE} WHERE status = ${emailConst.status.SAVING} AND NOT EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
	},

	async batchDelete(c, params) {
		let { sendName, sendEmail, toEmail, subject, startTime, endTime, type  } = params

		const matcher = type === 'include' ? containsText : type === 'left' ? startsWithText : equalsText;

		const conditions = []

		if (sendName) {
			this.pushCondition(conditions, matcher(email.name, sendName))
		}

		if (subject) {
			this.pushCondition(conditions, matcher(email.subject, subject))
		}

		if (sendEmail) {
			this.pushCondition(conditions, matcher(email.sendEmail, sendEmail))
		}

		if (toEmail) {
			this.pushCondition(conditions, matcher(email.toEmail, toEmail))
		}

		if (startTime && endTime) {
			conditions.push(gte(email.createTime,`${startTime}`))
			conditions.push(lte(email.createTime,`${endTime}`))
		}

		if (conditions.length === 0) {
			return;
		}

		const emailIdsRow = await orm(c).select({emailId: email.emailId}).from(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).all();

		const emailIds = emailIdsRow.map(row => row.emailId);

		if (emailIds.length === 0){
			return;
		}

		await attService.removeByEmailIds(c, emailIds);

		await orm(c).delete(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).run();
	},

	async physicsDeleteByAccountId(c, accountId) {
		await attService.removeByAccountId(c, accountId);
		await orm(c).delete(email).where(eq(email.accountId, accountId)).run();
	},

	async read(c, params, userId) {
		const { emailIds } = params;
		await orm(c).update(email).set({ unread: emailConst.unread.READ }).where(and(eq(email.userId, userId), inArray(email.emailId, emailIds)));
	}
};

export default emailService;
