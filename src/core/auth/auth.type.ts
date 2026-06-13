export interface AuthProfile {
  user_id: string;
  username: string;
  avatarUrl: string;
  nickname: string | null;
}

export interface JwtPayload {
  user_id: string;
  username: string;
}
