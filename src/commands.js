/**
 * Share command metadata from a common spot to be used for both runtime
 * and registration.
 */

const userOption = { name: 'user', description: '승인할 사용자 (역할과 둘 중 하나 선택)', type: 6, required: false };
const roleOption = { name: 'role', description: '승인할 역할 (사용자와 둘 중 하나 선택)', type: 8, required: false };

export const APPROVE_COMMAND = {
  name: 'approve',
  description: '사용자 또는 역할을 봇 사용 허용 목록에 추가 (소유자 전용)',
  options: [userOption, roleOption],
};

const blockUserOption = { name: 'user', description: '차단할 사용자 (역할과 둘 중 하나 선택)', type: 6, required: false };
const blockRoleOption = { name: 'role', description: '차단할 역할 (사용자와 둘 중 하나 선택)', type: 8, required: false };

export const BLOCK_COMMAND = {
  name: 'block',
  description: '사용자 또는 역할을 봇 사용 허용 목록에서 제거 (소유자 전용)',
  options: [blockUserOption, blockRoleOption],
};

export const WELCOME_COMMAND = {
  name: '입장',
  description: '입장 역할 부여 및 입장 메시지 보내기',
  options: [
    { name: 'target_user', description: '입장 처리할 사용자', type: 6, required: true },
    { name: 'message', description: '맞춤 메시지 (비워두면 기본 메시지)', type: 3, required: false },
  ],
};

const channelOption = (name, description) => ({ name, description, type: 7, required: false });

export const WELCOME_CONFIG_COMMAND = {
  name: '입장설정',
  description: '입장 시 부여할 역할 및 입장 메시지 채널 설정',
  options: [
    { name: 'role', description: '입장 시 부여할 역할', type: 8, required: false },
    channelOption('auto_channel', '자동 메시지를 보낼 채널'),
    channelOption('main_channel', '메인 입장 메시지를 보낼 채널'),
  ],
};

export const VERIFY_CONFIG_COMMAND = {
  name: '인증설정',
  description: '인증 시 부여할 역할과 축하 메시지를 보낼 채널 설정',
  options: [
    { name: 'role', description: '인증 시 부여할 역할', type: 8, required: false },
    channelOption('channel', '인증 축하 메시지를 보낼 채널'),
  ],
};

export const VERIFY_COMMAND = {
  name: '인증',
  description: '대상 사용자에게 인증 역할을 부여하고 축하 메시지 전송',
  options: [
    { name: 'target_user', description: '인증할 사용자', type: 6, required: true },
    { name: 'message', description: '맞춤 축하 메시지 (비워두면 "인증축하드립니다")', type: 3, required: false },
  ],
};
