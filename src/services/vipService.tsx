import { DEFAULT_VIP_DATA } from '@/store/vip-store';
import { doc, updateDoc, addDoc, collection, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Calculate max referrals based on the target VIP level.
export const calculateMaxReferrals = (currentLevel: number) => {
/*
  const maxReferrals = { ...DEFAULT_VIP_DATA.maxReferrals };
  // For each level below current, add 10 slots.
  for (let level = 1; level < currentLevel; level++) {
    const vipKey = `vip${level}` as keyof typeof maxReferrals;
    maxReferrals[vipKey] += 10;
  }
  return maxReferrals;

  */

          let newMaxReferrals;
          if (currentLevel=== 1) {
            newMaxReferrals = {
              vip1: 10,
            };
          }
          if (currentLevel=== 2) {
            newMaxReferrals = {
              vip1: 20,
              vip2: 10
            };
          }
          if (currentLevel=== 3) {
            newMaxReferrals = {
              vip1: 30,
              vip2: 20,
              vip3: 10
            };
          }
          if (currentLevel=== 4) {
            newMaxReferrals = {
              vip1: 40,
              vip2: 30,
              vip3: 20,
              vip4: 10
            };
          }
          if (currentLevel=== 5) {
            newMaxReferrals = {
              vip1: 50,
              vip2: 40,
              vip3: 30,
              vip4: 20,
              vip5: 10
            };
          }
          return newMaxReferrals;
};

// Upgrade a user's VIP level by updating their document.
export const upgradeUserVIP = async (userId: string, targetLevel: number) => {
  const userRef = doc(db, 'users', userId);
  const newMaxReferrals = calculateMaxReferrals(targetLevel);
  await updateDoc(userRef, {
    vipLevel: targetLevel,
    maxReferrals: newMaxReferrals,
  });
};

// Process a VIP upgrade request using a Firestore batch update.
export const processUpgradeRequest = async (
  request: { id: string; userId: string; targetLevel: number },
  approve: boolean
) => {
  const batch = writeBatch(db);
  const requestRef = doc(db, 'requests', request.id);
  const userRef = doc(db, 'users', request.userId);

  if (approve) {
    const newMaxReferrals = calculateMaxReferrals(request.targetLevel);
    batch.update(userRef, {
      vipLevel: request.targetLevel,
      maxReferrals: newMaxReferrals,
    });
  }
  batch.update(requestRef, {
    status: approve ? 'approved' : 'declined',
    processedAt: new Date(),
  });
  await batch.commit();
};
