import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { collection, doc, getDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { calculateMaxReferrals } from '@/services/vipService';

export interface VIPState {
  vipLevel: number;
  referralCode: string;
  referrals: {
    vip1: string[];
    vip2: string[];
    vip3: string[];
    vip4: string[];
    vip5: string[];
  };
  maxReferrals: {
    vip1: number;
    vip2: number;
    vip3: number;
    vip4: number;
    vip5: number;
  };
  rewards: {
    vip1: number;
    vip2: number;
    vip3: number;
    vip4: number;
    vip5: number;
  };
  initializeVIP: (userId: string) => Promise<void>;
  requestUpgrade: (userId: string, targetLevel: number) => Promise<void>;
}

export const DEFAULT_VIP_DATA = {
  vipLevel: 0,
  referrals: {
    vip1: [],
    vip2: [],
    vip3: [],
    vip4: [],
    vip5: [],
  },
  maxReferrals: {
    vip1: 10,
    vip2: 10,
    vip3: 10,
    vip4: 10,
    vip5: 10,
  },
  rewards: {
    vip1: 100,
    vip2: 300,
    vip3: 600,
    vip4: 1200,
    vip5: 2400,
  },
};

export const useVIPStore = create<VIPState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_VIP_DATA,
      initializeVIP: async (userId: string) => {
        try {
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);

          if (!userDoc.exists()) {
            throw new Error('User not found');
          }

          const userData = userDoc.data();
          const currentLevel = userData.vipLevel || DEFAULT_VIP_DATA.vipLevel;

          // If VIP data is missing, initialize the document.
          if (!userData.vipLevel) {
            await updateDoc(userRef, {
              vipLevel: DEFAULT_VIP_DATA.vipLevel,
              referrals: DEFAULT_VIP_DATA.referrals,
              maxReferrals: calculateMaxReferrals(currentLevel),
              rewards: DEFAULT_VIP_DATA.rewards,
            });
          }

          // Update local state.
          set({
            vipLevel: currentLevel,
            referralCode: userData.referralCode,
            referrals: {
              ...DEFAULT_VIP_DATA.referrals,
              ...userData.referrals,
            },
            maxReferrals: {
              ...calculateMaxReferrals(currentLevel),
              ...userData.maxReferrals,
            },
            rewards: {
              ...DEFAULT_VIP_DATA.rewards,
              ...userData.rewards,
            },
          });
        } catch (error) {
          console.error('Failed to initialize VIP:', error);
          throw error;
        }
      },
      requestUpgrade: async (userId: string, targetLevel: number) => {
        try {
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);

          if (!userDoc.exists()) {
            throw new Error('User not found');
          }

          const userData = userDoc.data();
          const currentLevel = userData.vipLevel || DEFAULT_VIP_DATA.vipLevel;

          if (targetLevel <= currentLevel) {
            throw new Error('Cannot upgrade to same or lower level');
          }

          if (targetLevel > 5) {
            throw new Error('Invalid VIP level');
          }

          // Create an upgrade request.
          await addDoc(collection(db, 'requests'), {
            userId,
            username: userData.username,
            type: 'vip_upgrade',
            currentLevel,
            targetLevel,
            status: 'pending',
            timestamp: new Date(),
          });
        } catch (error) {
          console.error('Failed to request upgrade:', error);
          throw error;
        }
      },
    }),
    {
      name: 'vip-storage',
      partialize: (state) => ({
        vipLevel: state.vipLevel,
        referralCode: state.referralCode,
        referrals: state.referrals,
        rewards: state.rewards,
      }),
    }
  )
);
