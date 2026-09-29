export type AuthStackParamList = {
  Login: undefined;
  OTP: { email: string };
  Register: undefined;
};

export type DashboardStackParamList = {
  Dashboard: undefined;
  JobDetail: { id: string; source: 'booking' | 'ride' | 'package' };
};

export type EarningsStackParamList = {
  Earnings: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
};

export type RootTabParamList = {
  DashboardTab: undefined;
  EarningsTab: undefined;
  ProfileTab: undefined;
};
