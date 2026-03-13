/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter } from 'itty-router';
import {
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from 'discord-interactions';
import { APPROVE_COMMAND, BLOCK_COMMAND, WELCOME_COMMAND, WELCOME_CONFIG_COMMAND, VERIFY_COMMAND, VERIFY_CONFIG_COMMAND, EMOJI_COMMAND } from './commands.js';
import { JsonResponse } from './JsonResponse.js';

// ─── 명령어 권한 구분 ─────────────────────────────────────────
/** 소유자 전용 (OWNER_ID만 사용 가능) */
const OWNER_ONLY_COMMANDS = [
  APPROVE_COMMAND.name.toLowerCase(),
  BLOCK_COMMAND.name.toLowerCase(),
];
/** 관리자 전용 (소유자 또는 allowed_users / allowed_roles) */
const ALLOWLIST_COMMANDS = [
  WELCOME_COMMAND.name.toLowerCase(),
  WELCOME_CONFIG_COMMAND.name.toLowerCase(),
  VERIFY_COMMAND.name.toLowerCase(),
  VERIFY_CONFIG_COMMAND.name.toLowerCase(),
];
/** 권한 없이 사용 가능 */
const PUBLIC_COMMANDS = [
  EMOJI_COMMAND.name.toLowerCase(),
];
// ─────────────────────────────────────────────────────────────

/** KV key for the allowed users list (JSON array of user ids) */
const KV_KEY_ALLOWED_USERS = 'allowed_users';
/** KV key for the allowed roles list (JSON array of role ids) */
const KV_KEY_ALLOWED_ROLES = 'allowed_roles';
/** KV key for the channel id where .환영 auto message is sent */
const KV_KEY_WELCOME_AUTO_CHANNEL = 'welcome_auto_channel_id';
/** KV key for the channel id where main welcome message is sent */
const KV_KEY_WELCOME_MAIN_CHANNEL = 'welcome_main_channel_id';
/** KV key for the role to grant on welcome (환영) */
const KV_KEY_ENTRANCE_ROLE = 'entrance_role_id';
/** KV key for the auto message prefix (e.g. ".환영") */
const KV_KEY_WELCOME_AUTO_PREFIX = 'welcome_auto_prefix';
/** KV key for the role to grant on verify */
const KV_KEY_VERIFY_ROLE = 'verification_role_id';
/** KV key for the channel to send verify congrats message */
const KV_KEY_VERIFY_CHANNEL = 'verification_channel_id';

/** Whitelist: add user to allowed list */
async function approveUser(userId, env) {
  const current = await env.ALLOWED_USERS.get(KV_KEY_ALLOWED_USERS) ?? await env.ALLOWED_USERS.get('list');
  const list = current ? JSON.parse(current) : [];
  if (!list.includes(userId)) list.push(userId);
  await env.ALLOWED_USERS.put(KV_KEY_ALLOWED_USERS, JSON.stringify(list));
  return list;
}

/** Whitelist: remove user from allowed list */
async function blockUser(userId, env) {
  const current = await env.ALLOWED_USERS.get(KV_KEY_ALLOWED_USERS) ?? await env.ALLOWED_USERS.get('list');
  const list = current ? JSON.parse(current) : [];
  const newList = list.filter((id) => id !== userId);
  await env.ALLOWED_USERS.put(KV_KEY_ALLOWED_USERS, JSON.stringify(newList));
  return newList;
}

/** Whitelist: add role to allowed list */
async function approveRole(roleId, env) {
  const current = await env.ALLOWED_USERS.get(KV_KEY_ALLOWED_ROLES);
  const list = current ? JSON.parse(current) : [];
  if (!list.includes(roleId)) list.push(roleId);
  await env.ALLOWED_USERS.put(KV_KEY_ALLOWED_ROLES, JSON.stringify(list));
  return list;
}

/** Whitelist: remove role from allowed list */
async function blockRole(roleId, env) {
  const current = await env.ALLOWED_USERS.get(KV_KEY_ALLOWED_ROLES);
  const list = current ? JSON.parse(current) : [];
  const newList = list.filter((id) => id !== roleId);
  await env.ALLOWED_USERS.put(KV_KEY_ALLOWED_ROLES, JSON.stringify(newList));
  return newList;
}

/** True if user is in allowed_users or has any role in allowed_roles */
async function isAllowed(userId, memberRoleIds, env) {
  const usersRaw = await env.ALLOWED_USERS.get(KV_KEY_ALLOWED_USERS) ?? await env.ALLOWED_USERS.get('list');
  const users = usersRaw ? JSON.parse(usersRaw) : [];
  if (users.includes(userId)) return true;
  const rolesRaw = await env.ALLOWED_USERS.get(KV_KEY_ALLOWED_ROLES);
  const roles = rolesRaw ? JSON.parse(rolesRaw) : [];
  const memberRoles = Array.isArray(memberRoleIds) ? memberRoleIds : [];
  return memberRoles.some((roleId) => roles.includes(String(roleId)));
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
router.post('/', async (request, env, ctx) => {
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
    const memberRoleIds = interaction.member?.roles ?? [];

    // 명령어 권한 검사 로직: 소유자 전용 → 검사, 관리자 전용 → 소유자 또는 allowlist 검사, 그 외(PUBLIC 등) → 검사 없음
    if (OWNER_ONLY_COMMANDS.includes(commandName)) {
      if (userId !== env.OWNER_ID) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '권한 없음', flags: 64 },
        });
      }
    } else if (ALLOWLIST_COMMANDS.includes(commandName)) {
      if (userId !== env.OWNER_ID) {
        const allowed = await isAllowed(userId, memberRoleIds, env);
        if (!allowed) {
          return new JsonResponse({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '권한 없음', flags: 64 },
          });
        }
      }
    }

    if (commandName === APPROVE_COMMAND.name.toLowerCase()) {
      const options = interaction.data.options ?? [];
      const targetUser = options.find((o) => o.name === 'user')?.value;
      const targetRole = options.find((o) => o.name === 'role')?.value;
      if (targetUser && targetRole) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '사용자와 역할 중 하나만 선택해 주세요.', flags: 64 },
        });
      }
      if (targetUser) {
        await approveUser(targetUser, env);
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `<@${targetUser}> 승인됨` },
        });
      }
      if (targetRole) {
        await approveRole(targetRole, env);
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `<@&${targetRole}> 역할 승인됨` },
        });
      }
      return new JsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '승인할 사용자 또는 역할을 선택해 주세요.', flags: 64 },
      });
    }

    if (commandName === BLOCK_COMMAND.name.toLowerCase()) {
      const options = interaction.data.options ?? [];
      const targetUser = options.find((o) => o.name === 'user')?.value;
      const targetRole = options.find((o) => o.name === 'role')?.value;
      if (targetUser && targetRole) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '사용자와 역할 중 하나만 선택해 주세요.', flags: 64 },
        });
      }
      if (targetUser) {
        await blockUser(targetUser, env);
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `<@${targetUser}> 제거됨` },
        });
      }
      if (targetRole) {
        await blockRole(targetRole, env);
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `<@&${targetRole}> 역할 제거됨` },
        });
      }
      return new JsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '제거할 사용자 또는 역할을 선택해 주세요.', flags: 64 },
      });
    }

    if (commandName === WELCOME_CONFIG_COMMAND.name.toLowerCase()) {
      const options = interaction.data.options ?? [];
      const roleId = options.find((o) => o.name === 'role')?.value;
      const autoChannel = options.find((o) => o.name === 'auto_channel')?.value;
      const mainChannel = options.find((o) => o.name === 'main_channel')?.value;
      const updates = [];
      if (roleId != null) {
        await env.ALLOWED_USERS.put(KV_KEY_ENTRANCE_ROLE, String(roleId));
        updates.push(`환영 역할: <@&${roleId}>`);
      }
      if (autoChannel != null) {
        await env.ALLOWED_USERS.put(KV_KEY_WELCOME_AUTO_CHANNEL, String(autoChannel));
        updates.push(`자동 채널: <#${autoChannel}>`);
      }
      if (mainChannel != null) {
        await env.ALLOWED_USERS.put(KV_KEY_WELCOME_MAIN_CHANNEL, String(mainChannel));
        updates.push(`메인 채널: <#${mainChannel}>`);
      }
      if (updates.length === 0) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '환영 역할, 자동 채널, 메인 채널 중 하나를 설정해 주세요. (`/환영설정` 옵션)',
            flags: 64,
          },
        });
      }
      return new JsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `환영 설정 저장됨.\n${updates.join('\n')}` },
      });
    }

    if (commandName === VERIFY_CONFIG_COMMAND.name.toLowerCase()) {
      const options = interaction.data.options ?? [];
      const roleId = options.find((o) => o.name === 'role')?.value;
      const channelId = options.find((o) => o.name === 'channel')?.value;
      const updates = [];
      if (roleId != null) {
        await env.ALLOWED_USERS.put(KV_KEY_VERIFY_ROLE, String(roleId));
        updates.push(`인증 역할: <@&${roleId}>`);
      }
      if (channelId != null) {
        await env.ALLOWED_USERS.put(KV_KEY_VERIFY_CHANNEL, String(channelId));
        updates.push(`축하 메시지 채널: <#${channelId}>`);
      }
      if (updates.length === 0) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '인증 역할 또는 축하 메시지 채널을 설정해 주세요. (`/인증설정` 옵션)',
            flags: 64,
          },
        });
      }
      return new JsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `인증 설정 저장됨.\n${updates.join('\n')}` },
      });
    }

    if (commandName === VERIFY_COMMAND.name.toLowerCase()) {
      const options = interaction.data.options ?? [];
      const targetUserId = options.find((o) => o.name === 'target_user')?.value;
      const customMessage = options.find((o) => o.name === 'message')?.value;
      if (!targetUserId) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '인증할 사용자를 선택해 주세요.', flags: 64 },
        });
      }

      const roleId = await env.ALLOWED_USERS.get(KV_KEY_VERIFY_ROLE);
      const channelId = await env.ALLOWED_USERS.get(KV_KEY_VERIFY_CHANNEL);
      if (!roleId || !channelId) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '먼저 `/인증설정`으로 인증 역할과 축하 메시지 채널을 설정해 주세요.',
            flags: 64,
          },
        });
      }

      const guildId = interaction.guild_id;
      if (!guildId) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '서버(길드) 정보를 찾을 수 없습니다.', flags: 64 },
        });
      }

      const deferredResponse = new JsonResponse({
        type: 5,
        data: { flags: 64 },
      });
      const workPromise = (async () => {
        let resultContent = '인증 완료했습니다.';
        try {
          const addRoleRes = await fetch(
            `https://discord.com/api/v10/guilds/${guildId}/members/${targetUserId}/roles/${roleId}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bot ${env.DISCORD_TOKEN}`,
              },
              body: '{}',
            },
          );
          if (!addRoleRes.ok) {
            const errText = await addRoleRes.text();
            console.error('Discord add role failed:', addRoleRes.status, errText);
            let reason = errText;
            try {
              const errJson = JSON.parse(errText);
              if (errJson.message) reason = errJson.message;
              if (errJson.code) reason = `[${errJson.code}] ${reason}`;
            } catch (_) {}
            resultContent = `역할 부여 실패 (${addRoleRes.status}): ${reason}`;
            if (addRoleRes.status === 403) {
              resultContent += '\n→ 봇에 "역할 관리" 권한이 있는지, 부여할 역할이 봇 역할보다 아래에 있는지 확인하세요.';
            }
          } else {
            const congratsText = customMessage?.trim() ? customMessage.trim() : '인증축하드립니다';
            const content = `<@${targetUserId}> ${congratsText}`;
            const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bot ${env.DISCORD_TOKEN}`,
              },
              body: JSON.stringify({ content }),
            });
            if (!msgRes.ok) {
              const errText = await msgRes.text();
              console.error('Discord verify channel message failed:', msgRes.status, errText);
              resultContent = `역할은 부여했으나 축하 메시지 전송 실패 (${msgRes.status})`;
            }
          }
        } catch (err) {
          console.error('VERIFY_COMMAND error:', err);
          resultContent = `오류: ${err?.message ?? String(err)}`;
        }
        await fetch(
          `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bot ${env.DISCORD_TOKEN}`,
            },
            body: JSON.stringify({ content: resultContent }),
          },
        );
      })();
      if (ctx?.waitUntil) ctx.waitUntil(workPromise);
      return deferredResponse;
    }

    if (commandName === WELCOME_COMMAND.name.toLowerCase()) {
      const options = interaction.data.options ?? [];
      const targetUserId = options.find((o) => o.name === 'target_user')?.value;
      const customMessage = options.find((o) => o.name === 'message')?.value;
      if (!targetUserId) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '환영할 사용자를 선택해 주세요.', flags: 64 },
        });
      }

      const entranceRoleId = await env.ALLOWED_USERS.get(KV_KEY_ENTRANCE_ROLE);
      const autoChannelId = await env.ALLOWED_USERS.get(KV_KEY_WELCOME_AUTO_CHANNEL);
      const mainChannelId = await env.ALLOWED_USERS.get(KV_KEY_WELCOME_MAIN_CHANNEL);
      if (!entranceRoleId || !autoChannelId || !mainChannelId) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '먼저 `/환영설정`으로 환영 역할, 자동 채널, 메인 채널을 설정해 주세요.',
            flags: 64,
          },
        });
      }

      const guildId = interaction.guild_id;
      if (!guildId) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '서버(길드) 정보를 찾을 수 없습니다.', flags: 64 },
        });
      }

      // Respond within 3s, then grant role and send messages via follow-up
      const deferredResponse = new JsonResponse({
        type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        data: { flags: 64 },
      });
      const workPromise = (async () => {
        let resultContent = '환영 처리했습니다.';
        try {
          // 1) Grant entrance role
          const addRoleRes = await fetch(
            `https://discord.com/api/v10/guilds/${guildId}/members/${targetUserId}/roles/${entranceRoleId}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bot ${env.DISCORD_TOKEN}`,
              },
              body: '{}',
            },
          );
          if (!addRoleRes.ok) {
            const errText = await addRoleRes.text();
            console.error('Discord add entrance role failed:', addRoleRes.status, errText);
            let reason = errText;
            try {
              const errJson = JSON.parse(errText);
              if (errJson.message) reason = errJson.message;
              if (errJson.code) reason = `[${errJson.code}] ${reason}`;
            } catch (_) {}
            resultContent = `역할 부여 실패 (${addRoleRes.status}): ${reason}`;
            if (addRoleRes.status === 403) {
              resultContent += '\n→ 봇에 "역할 관리" 권한이 있는지, 부여할 역할이 봇 역할보다 아래에 있는지 확인하세요.';
            }
          } else {
            // 2) Send auto channel message
            const auto_message = `<@${targetUserId}> 유저가 되신걸 환영해요! <a:126:1442523976697122947>

 <#1382470954810343505> 공지 확인,  

  주요 공지는 <#1441061260572626994>

 dm보내기 전에 <#1425477200525660290> 

 문의가 있다면 <#1382471822628487228>

 활동레벨 5렙 달성 후<#1382471705552748737> 티켓 이행하기

<#1382471129431670954> 확인이 끝났습니다! 앞으로 즐겁게 지내보아요 *ˊᗜˋ* <a:127:1442523996582052133>`;
            const createRes1 = await fetch(`https://discord.com/api/v10/channels/${autoChannelId}/messages`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bot ${env.DISCORD_TOKEN}`,
              },
              body: JSON.stringify({ content: auto_message }),
            });
            if (!createRes1.ok) {
              const errText = await createRes1.text();
              console.error('Discord auto channel message failed:', createRes1.status, errText);
              resultContent = `역할은 부여했으나 자동 메시지 전송 실패 (${createRes1.status})`;
            } else {
              // 3) Send main channel message
              const content = customMessage?.trim()
                ? `<@${targetUserId}> ${customMessage.trim()}`
                : `<@${targetUserId}> 어서오세요!`;
              const createRes2 = await fetch(`https://discord.com/api/v10/channels/${mainChannelId}/messages`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bot ${env.DISCORD_TOKEN}`,
                },
                body: JSON.stringify({ content }),
              });
              if (!createRes2.ok) {
                const errText = await createRes2.text();
                console.error('Discord main channel message failed:', createRes2.status, errText);
                resultContent = `역할·자동 메시지는 완료했으나 메인 채널 전송 실패 (${createRes2.status})`;
              }
            }
          }
        } catch (err) {
          console.error('WELCOME_COMMAND (환영) error:', err);
          resultContent = `오류: ${err?.message ?? String(err)}`;
        }
        await fetch(
          `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bot ${env.DISCORD_TOKEN}`,
            },
            body: JSON.stringify({ content: resultContent }),
          },
        );
      })();
      if (ctx?.waitUntil) ctx.waitUntil(workPromise);
      return deferredResponse;
    }

    if (commandName === EMOJI_COMMAND.name.toLowerCase()) {
      const options = interaction.data.options ?? [];
      const emojiMessage = options.find((o) => o.name === 'emoji_message')?.value;
      if (!emojiMessage || typeof emojiMessage !== 'string') {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '이모지를 입력해 주세요.', flags: 64 },
        });
      }
      // Discord format: <:name:id> or <a:name:id> (animated)
      const match = emojiMessage.match(/<a?:[\w]+:(\d+)>/);
      if (!match) {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '커스텀 이모지 형식이 아닙니다. `<:이름:숫자>` 형태로 서버 이모지를 붙여넣어 주세요.', flags: 64 },
        });
      }
      const emojiId = match[1];
      const isAnimated = emojiMessage.startsWith('<a:');
      const ext = isAnimated ? 'gif' : 'png';
      const imageUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}`;
      return new JsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: imageUrl },
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
  fetch: (request, env, ctx) => router.fetch(request, env, ctx),
};

export default server;
