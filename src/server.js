/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter } from 'itty-router';
import {
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from 'discord-interactions';
import { APPROVE_COMMAND, BLOCK_COMMAND, WELCOME_COMMAND } from './commands.js';

class JsonResponse extends Response {
  constructor(body, init) {
    const jsonBody = JSON.stringify(body);
    init = init || {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
    };
    super(jsonBody, init);
  }
}

/** Whitelist: add user to allowed list (KV key "list" = JSON array of user ids) */
async function approveUser(userId, env) {
  const current = await env.ALLOWED_USERS.get('list');
  const list = current ? JSON.parse(current) : [];
  if (!list.includes(userId)) list.push(userId);
  await env.ALLOWED_USERS.put('list', JSON.stringify(list));
  return list;
}

/** Whitelist: remove user from allowed list */
async function blockUser(userId, env) {
  const current = await env.ALLOWED_USERS.get('list');
  const list = current ? JSON.parse(current) : [];
  const newList = list.filter((id) => id !== userId);
  await env.ALLOWED_USERS.put('list', JSON.stringify(newList));
  return newList;
}

const router = AutoRouter();

/**
 * A simple :wave: hello page to verify the worker is working.
 */
router.get('/', (request, env) => {
  return new Response(`👋 ${env.DISCORD_APPLICATION_ID}`);
});

/**
 * Main route for all requests sent from Discord.  All incoming messages will
 * include a JSON payload described here:
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 */
router.post('/', async (request, env) => {
  const { isValid, interaction } = await server.verifyDiscordRequest(
    request,
    env,
  );
  if (!isValid || !interaction) {
    return new Response('Bad request signature.', { status: 401 });
  }

  if (interaction.type === InteractionType.PING) {
    // The `PING` message is used during the initial webhook handshake, and is
    // required to configure the webhook in the developer portal.
    return new JsonResponse({
      type: InteractionResponseType.PONG,
    });
  }
  
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const commandName = interaction.data.name.toLowerCase();
    const user = interaction.member?.user ?? interaction.user;
    const userId = user.id;

    // Owner-only: approve / block / 환영
    if (userId !== env.OWNER_ID) {
      return new JsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '권한 없음', flags: 64 },
      });
    }

    if (commandName === APPROVE_COMMAND.name.toLowerCase()) {
      const targetUserId = interaction.data.options?.[0]?.value;
      if (!targetUserId) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '대상 유저를 선택해 주세요.', flags: 64 },
        });
      }
      await approveUser(targetUserId, env);
      return new JsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `<@${targetUserId}> 승인됨` },
      });
    }

    if (commandName === BLOCK_COMMAND.name.toLowerCase()) {
      const targetUserId = interaction.data.options?.[0]?.value;
      if (!targetUserId) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '대상 유저를 선택해 주세요.', flags: 64 },
        });
      }
      await blockUser(targetUserId, env);
      return new JsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `<@${targetUserId}> 제거됨` },
      });
    }

    if (commandName === WELCOME_COMMAND.name.toLowerCase()) {
      const auto_channel_id = 1342645057823703060;
      const main_channel_id = 1474993463312388158;
      const auto_message = `.환영 <@${targetUserId}>`;
      const options = interaction.data.options ?? [];
      const targetUserId = options.find((o) => o.name === 'target_user')?.value;
      const customMessage = options.find((o) => o.name === 'message')?.value;
      if (!targetUserId || !channelId) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '대상 유저와 채널을 선택해 주세요.', flags: 64 },
        });
      }

      const createRes1 = await fetch(`https://discord.com/api/v10/channels/${auto_channel_id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${env.DISCORD_TOKEN}`,
        },
        body: JSON.stringify({ auto_message }),
      });
      if (!createRes1.ok) {
        const errText = await createRes.text();
        console.error('Discord create message failed:', createRes.status, errText);
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `AUTO 메시지를 보내지 못했습니다. (${createRes.status})`, flags: 64 },
        });
      }

      const content = customMessage?.trim()
        ? `<@${targetUserId}> ${customMessage.trim()}`
        : `<@${targetUserId}> 어서오세요!`;
      const createRes2 = await fetch(`https://discord.com/api/v10/channels/${main_channel_id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${env.DISCORD_TOKEN}`,
        },
        body: JSON.stringify({ content }),
      });
      if (!createRes2.ok) {
        const errText = await createRes.text();
        console.error('Discord create message failed:', createRes.status, errText);
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `채널에 메시지를 보내지 못했습니다. (${createRes.status})`, flags: 64 },
        });
      }
      return new JsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '환영 메시지를 보냈습니다.', flags: 64 },
      });
    }

    return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
  }

  console.error('Unknown Type');
  return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
});
router.all('*', () => new Response('Not Found.', { status: 404 }));

async function verifyDiscordRequest(request, env) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();
  const isValidRequest =
    signature &&
    timestamp &&
    (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));
  if (!isValidRequest) {
    return { isValid: false };
  }

  return { interaction: JSON.parse(body), isValid: true };
}

const server = {
  verifyDiscordRequest,
  fetch: router.fetch,
};

export default server;
