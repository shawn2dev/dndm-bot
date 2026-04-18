/**
 * Share command metadata from a common spot to be used for both runtime
 * and registration.
 * 권한 구분은 server.js의 OWNER_ONLY_COMMANDS / ALLOWLIST_COMMANDS / PUBLIC_COMMANDS와 일치시킬 것.
 */

// ─── 공통 옵션 ─────────────────────────────────────────────────
const userOption = { name: 'user', description: '승인할 사용자 (역할과 둘 중 하나 선택)', type: 6, required: false };
const roleOption = { name: 'role', description: '승인할 역할 (사용자와 둘 중 하나 선택)', type: 8, required: false };
const channelOption = (name, description) => ({ name, description, type: 7, required: false });
// ─────────────────────────────────────────────────────────────

// ─── 소유자 전용 (OWNER_ID만 사용 가능) ─────────────────────────
export const APPROVE_COMMAND = {
  name: 'approve',
  description: '사용자 또는 역할을 서버 관리자 목록에 추가 (소유자 전용)',
  options: [userOption, roleOption],
};

const blockUserOption = { name: 'user', description: '차단할 사용자 (역할과 둘 중 하나 선택)', type: 6, required: false };
const blockRoleOption = { name: 'role', description: '차단할 역할 (사용자와 둘 중 하나 선택)', type: 8, required: false };

export const BLOCK_COMMAND = {
  name: 'block',
  description: '사용자 또는 역할을 봇 사용 허용 목록에서 제거 (소유자 전용)',
  options: [blockUserOption, blockRoleOption],
};
// ─────────────────────────────────────────────────────────────

// ─── 관리자 전용 (소유자 또는 allowed_users / allowed_roles) ────
export const WELCOME_COMMAND = {
  name: '환영',
  description: '환영 역할 부여 및 환영 메시지 보내기 (관리자 전용)',
  options: [
    { name: 'target_user', description: '환영할 사용자', type: 6, required: true },
    { name: 'message', description: '맞춤 메시지 (비워두면 기본 메시지)', type: 3, required: false },
  ],
};

export const WELCOME_CONFIG_COMMAND = {
  name: '환영설정',
  description: '환영 시 부여할 역할 및 환영 메시지 채널 설정 (관리자 전용)',
  options: [
    { name: 'role', description: '환영 시 부여할 역할', type: 8, required: false },
    channelOption('auto_channel', '자동 메시지를 보낼 채널'),
    channelOption('main_channel', '메인 환영 메시지를 보낼 채널'),
  ],
};

export const VERIFY_CONFIG_COMMAND = {
  name: '인증설정',
  description: '인증 시 부여할 역할과 축하 메시지를 보낼 채널 설정 (관리자 전용)',
  options: [
    { name: 'role', description: '인증 시 부여할 역할', type: 8, required: false },
    channelOption('channel', '인증 축하 메시지를 보낼 채널'),
  ],
};

export const LOG_CONFIG_COMMAND = {
  name: '로그설정',
  description: '명령어 사용 로그를 출력할 채널 설정 (관리자 전용)',
  options: [
    { name: 'channel', description: '로그 메시지를 보낼 채널', type: 7, required: true },
  ],
};

export const VERIFY_COMMAND = {
  name: '인증',
  description: '대상 사용자에게 인증 역할을 부여하고 축하 메시지 전송 (관리자 전용)',
  options: [
    { name: 'target_user', description: '인증할 사용자', type: 6, required: true },
    { name: 'message', description: '맞춤 축하 메시지 (비워두면 "인증축하드립니다")', type: 3, required: false },
  ],
};
// ─────────────────────────────────────────────────────────────

// ─── 권한 없이 사용 가능 ───────────────────────────────────────
export const EMOJI_COMMAND = {
  name: '이모지확대',
  description: '이모지를 크게 보여줍니다.',
  options: [
    { name: 'emoji_message', description: '이모지를 넣으면 됩니다.', type: 3, required: true },
  ],
};
// ─────────────────────────────────────────────────────────────

export const INTRO_TEMPLATE_COMMAND = {
  name: '자기소개양식',
  description: '자기소개 양식을 출력합니다.',
};
