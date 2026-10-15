import {
	IDataObject,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';

export class SynologyChatTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Synology Chat Trigger',
		name: 'synologyChatTrigger',
		icon: 'file:SynologyChat.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["path"]}}',
		description: 'Handle incoming messages and commands from Synology Chat via Outgoing Webhooks',
		defaults: {
			name: 'Synology Chat Trigger',
		},
		inputs: [],
		outputs: ['main'],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: '={{$parameter["responseMode"]}}',
				path: '={{$parameter["path"]}}',
			},
		],
		properties: [
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: 'synology-chat',
				placeholder: 'synology-chat',
				required: true,
				description: 'The path to listen to (e.g. "synology-chat")',
			},
			{
				displayName: 'Token',
				name: 'token',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				placeholder: 'Paste outgoing webhook token here',
				description: 'The token generated in Synology Chat Outgoing Webhook integration. If set, requests with missing or invalid tokens are rejected (401).',
			},
			{
				displayName: 'Trigger Word',
				name: 'triggerWord',
				type: 'string',
				default: 'naf:',
				placeholder: 'e.g. naf:',
				description: 'The trigger word configured in Synology Chat (e.g. "naf:"). If present at the beginning of the message, it is stripped from cleanText and command.',
			},
			{
				displayName: 'Allowed User IDs',
				name: 'allowedUserIds',
				type: 'string',
				default: '',
				placeholder: 'e.g. 1024, 1025',
				description: 'Comma-separated list of numeric Synology Chat User IDs allowed to trigger actions. If empty, all users in the channel are allowed.',
			},
			{
				displayName: 'Response Mode',
				name: 'responseMode',
				type: 'options',
				options: [
					{
						name: 'Immediately',
						value: 'onReceived',
						description: 'Returns HTTP 200 immediately to Synology Chat',
					},
					{
						name: 'When Last Node Finishes',
						value: 'lastNode',
						description: 'Returns the output data of the last node to Synology Chat',
					},
					{
						name: "Using 'Respond to Webhook' Node",
						value: 'responseNode',
						description: "Response is defined by 'Respond to Webhook' node",
					},
				],
				default: 'onReceived',
				description: 'When and how to respond to the webhook',
			},
			{
				displayName: 'Immediate Response Text',
				name: 'responseMessage',
				type: 'string',
				default: '',
				placeholder: 'e.g. Przyjęto polecenie...',
				displayOptions: {
					show: {
						responseMode: ['onReceived'],
					},
				},
				description: 'Optional text displayed immediately in the Synology Chat channel. If empty, responds with 200 OK.',
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();
		const body = (this.getBodyData() || req.body || {}) as Record<string, any>;
		const headers = this.getHeaderData();
		const query = (this.getQueryData() || {}) as Record<string, any>;

		const rawToken = String(
			body.token ||
			headers['x-synology-token'] ||
			headers['x-token'] ||
			query.token ||
			''
		);

		const configuredToken = (this.getNodeParameter('token', '') as string).trim();
		if (configuredToken && rawToken !== configuredToken) {
			res.status(401).json({ error: 'Unauthorized: invalid token' }).end();
			return {
				noWebhookResponse: true,
			};
		}

		const userId = String(body.user_id ?? '');
		const username = String(body.username ?? '');
		const channelId = String(body.channel_id ?? '');
		const channelName = String(body.channel_name ?? '');
		const postId = String(body.post_id ?? '');
		const timestamp = body.timestamp ?? Date.now();
		const rawText = String(body.text ?? '');
		const triggerWord = String(body.trigger_word ?? '');

		const allowedUserIds = (this.getNodeParameter('allowedUserIds', '') as string).trim();
		if (allowedUserIds) {
			const allowedList = allowedUserIds.split(',').map((id) => id.trim()).filter(Boolean);
			if (allowedList.length > 0 && !allowedList.includes(userId)) {
				res.status(403).json({ text: 'Access denied: user_id is not authorized' }).end();
				return {
					noWebhookResponse: true,
				};
			}
		}

		const nodeTriggerWord = (this.getNodeParameter('triggerWord', '') as string).trim();
		let cleanText = rawText.trim();
		if (nodeTriggerWord && cleanText.toLowerCase().startsWith(nodeTriggerWord.toLowerCase())) {
			cleanText = cleanText.slice(nodeTriggerWord.length).trim();
		} else if (triggerWord && cleanText.toLowerCase().startsWith(triggerWord.toLowerCase())) {
			cleanText = cleanText.slice(triggerWord.length).trim();
		}

		const parts = cleanText.split(/\s+/).filter(Boolean);
		const command = parts[0] || '';
		const args = parts.slice(1).join(' ');

		const returnData: IDataObject = {
			cleanText,
			command,
			args,
			text: rawText,
			userId,
			username,
			channelId,
			channelName,
			postId,
			timestamp,
			triggerWord: triggerWord || nodeTriggerWord,
			raw: body,
		};

		const responseMode = this.getNodeParameter('responseMode', 'onReceived') as string;
		if (responseMode === 'onReceived') {
			const responseMessage = (this.getNodeParameter('responseMessage', '') as string).trim();
			if (responseMessage) {
				res.status(200).json({ text: responseMessage }).end();
				return {
					workflowData: [this.helpers.returnJsonArray([returnData])],
					noWebhookResponse: true,
				};
			}
		}

		return {
			workflowData: [this.helpers.returnJsonArray([returnData])],
		};
	}
}
