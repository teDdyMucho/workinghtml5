import { useState, useEffect } from 'react';
import { 
  doc, 
  updateDoc, 
  writeBatch, 
  increment, 
  addDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Timer, Lock, Unlock } from 'lucide-react';
import { VersusGame } from './types';
import { ImageEditDialog } from './image-edit-dialog';

interface Props {
  game: VersusGame;
  setError: (error: string) => void;
  setMessage: (message: string) => void;
}

export function GameCard({ game, setError, setMessage }: Props) {
  const [editingImage, setEditingImage] = useState<{
    type: 'team1' | 'team2' | 'banner';
    currentUrl: string;
  } | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');

  // Timer effect to update remaining time and auto-disable betting when time is up
  useEffect(() => {
    if (!game.endTime) return;

    const checkTime = () => {
      const now = new Date();
      const end = new Date(game.endTime);
      const diff = end.getTime() - now.getTime();

      if (diff <= 0) {
        // Auto disable betting when time is up if not already disabled
        if (game.bettingEnabled !== false) {
          updateDoc(doc(db, 'versusGames', game.id), {
            bettingEnabled: false
          }).catch(err => {
            console.error('Failed to auto-disable betting:', err);
          });
        }
        setTimeLeft('Ended');
        return false;
      }

      // Calculate remaining time
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      return true;
    };

    const shouldContinue = checkTime();
    if (!shouldContinue) return;
    const interval = setInterval(checkTime, 1000);
    return () => clearInterval(interval);
  }, [game.endTime, game.id, game.bettingEnabled]);

  // Handler to update an image URL
  const handleImageEdit = async (url: string) => {
    if (!editingImage) return;

    try {
      const batch = writeBatch(db);
      const gameRef = doc(db, 'versusGames', game.id);

      batch.update(gameRef, {
        teams: {
          ...game.teams,
          // Dynamically update the appropriate image field
          [`${editingImage.type}Image`]: url
        }
      });
      await batch.commit();
      setMessage('Image updated successfully');
      setEditingImage(null);
    } catch (err) {
      setError('Failed to update image');
      console.error(err);
    }
  };

  // Toggle bettingEnabled flag for the game
  const toggleBetting = async () => {
    try {
      await updateDoc(doc(db, 'versusGames', game.id), {
        bettingEnabled: !game.bettingEnabled
      });
      setMessage(`Betting ${!game.bettingEnabled ? 'enabled' : 'disabled'} for this game`);
    } catch (err) {
      setError('Failed to toggle betting');
      console.error(err);
    }
  };

  // Update the game duration by prompting for a new duration in hours
  const updateGameDuration = async () => {
    const hours = prompt('Enter new duration in hours:');
    if (!hours) return;

    const duration = parseInt(hours);
    if (isNaN(duration) || duration < 1 || duration > 72) {
      setError('Please enter a valid duration between 1 and 72 hours');
      return;
    }

    try {
      // Set a new end time based on the duration
      const endTime = new Date();
      endTime.setTime(endTime.getTime() + duration * 60 * 60 * 1000);

      await updateDoc(doc(db, 'versusGames', game.id), {
        endTime: endTime.toISOString()
      });
      setMessage(`Game duration updated to ${duration} hours`);
    } catch (err) {
      setError('Failed to update game duration');
      console.error(err);
    }
  };

  // Set initial funds for the game by incrementing the prize pool
  const setInitialFunds = async () => {
    const amount = prompt('Enter initial prize pool amount:');
    if (!amount) return;

    const funds = parseInt(amount);
    if (isNaN(funds) || funds < 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      const batch = writeBatch(db);
      const gameRef = doc(db, 'versusGames', game.id);

      batch.update(gameRef, {
        prizePool: increment(funds)
      });

      const transactionRef = doc(collection(db, 'transactions'));
      batch.set(transactionRef, {
        type: 'admin_versus_fund',
        amount: funds,
        description: 'Initial versus game funding',
        timestamp: new Date()
      });

      await batch.commit();
      setMessage(`Added ${funds} FBT to prize pool`);
    } catch (err) {
      setError('Failed to set initial funds');
      console.error(err);
    }
  };

  // End the game by processing bets and awarding winners
  const endGame = async () => {
    const winner = prompt('Enter winning team (1 or 2):');
    if (!winner || (winner !== '1' && winner !== '2')) {
      setError('Please enter a valid team number (1 or 2)');
      return;
    }

    try {
      const batch = writeBatch(db);
      const gameRef = doc(db, 'versusGames', game.id);
      const gameDoc = await getDoc(gameRef);

      if (!gameDoc.exists()) {
        setError('Game not found');
        return;
      }

      const gameData = gameDoc.data() as VersusGame;
      const winningTeam = parseInt(winner) as 1 | 2;
      const winningOdds = winningTeam === 1 ? gameData.odds.team1 : gameData.odds.team2;

      // Retrieve all pending bets for this game
      const betsQuery = query(
        collection(db, 'versusBets'),
        where('gameId', '==', game.id),
        where('status', '==', 'pending')
      );
      const betsSnapshot = await getDocs(betsQuery);

      const totalBets = gameData.prizePool;
      const houseFee = Math.floor(totalBets * 0.1);
      let totalWinnings = 0;

      // Process each bet: update winners and losers accordingly
      for (const betDoc of betsSnapshot.docs) {
        const bet = betDoc.data();
        const betRef = doc(db, 'versusBets', betDoc.id);

        if (Number(bet.team) === winningTeam) {
          const winnings = Math.floor(bet.amount * winningOdds * 0.9);
          totalWinnings += winnings;

          const userRef = doc(db, 'users', bet.userId);
          batch.update(userRef, {
            points: increment(winnings)
          });

          const winTransactionRef = doc(collection(db, 'transactions'));
          batch.set(winTransactionRef, {
            userId: bet.userId,
            username: bet.username,
            amount: winnings,
            type: 'versus_win',
            description: `Won versus bet on ${winningTeam === 1 ? gameData.teams.team1 : gameData.teams.team2} (after 10% fee)`,
            timestamp: new Date()
          });

          batch.update(betRef, {
            status: 'won',
            winnings,
            completedAt: new Date()
          });
        } else {
          batch.update(betRef, {
            status: 'lost',
            winnings: 0,
            completedAt: new Date()
          });
        }
      }

      // Record the house profit as a transaction
      const profitRef = doc(collection(db, 'transactions'));
      batch.set(profitRef, {
        type: 'admin_profit',
        gameType: 'versus',
        amount: houseFee,
        description: 'Versus game house fee (10% of total bets)',
        timestamp: new Date()
      });

      // Update the game document to mark it as completed
      batch.update(gameRef, {
        status: 'completed',
        winner: winner === '1' ? gameData.teams.team1 : gameData.teams.team2,
        endedAt: new Date(),
        totalWinnings,
        houseFee
      });

      await batch.commit();
      setMessage(`Game ended - Winners received ${totalWinnings} CASH (House fee: ${houseFee})`);
    } catch (err) {
      setError('Failed to end versus game');
      console.error(err);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      {/* Game Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold">
          {game.teams.team1} vs {game.teams.team2}
        </h3>
        <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
          <span>Started: {game.createdAt.toLocaleString()}</span>
          {timeLeft && (
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${
              timeLeft === 'Ended' 
                ? 'bg-red-100 text-red-800'
                : 'bg-blue-100 text-blue-800'
            }`}>
              {timeLeft === 'Ended' ? 'Time Up' : `Time Left: ${timeLeft}`}
            </span>
          )}
        </div>
      </div>

      {/* Teams Grid */}
      <div className="mb-6 grid grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="relative aspect-square overflow-hidden rounded-lg bg-gradient-to-br from-blue-100 to-blue-50">
            <img
              src={game.teams.team1Image || 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400'}
              alt={game.teams.team1}
              className="h-full w-full object-cover"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.src = 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400';
              }}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 p-4">
              <h4 className="text-lg font-bold text-white">{game.teams.team1}</h4>
              <p className="text-sm text-blue-200">Odds: {game.odds.team1}x</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative aspect-square overflow-hidden rounded-lg bg-gradient-to-br from-purple-100 to-purple-50">
            <img
              src={game.teams.team2Image || 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400'}
              alt={game.teams.team2}
              className="h-full w-full object-cover"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.src = 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400';
              }}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 p-4">
              <h4 className="text-lg font-bold text-white">{game.teams.team2}</h4>
              <p className="text-sm text-purple-200">Odds: {game.odds.team2}x</p>
            </div>
          </div>
        </div>
      </div>

      {/* Game Info */}
      <div className="mb-6 rounded-lg bg-gray-50 p-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-sm font-medium text-gray-600">Prize Pool</p>
            <p className="text-lg font-bold text-gray-900">{game.prizePool} FBT</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Betting Status</p>
            <p className={`text-lg font-bold ${
              game.bettingEnabled !== false ? 'text-green-600' : 'text-red-600'
            }`}>
              {game.bettingEnabled !== false ? 'Enabled' : 'Disabled'}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">End Time</p>
            <p className="text-lg font-bold text-gray-900">
              {game.endTime ? new Date(game.endTime).toLocaleString() : 'Not set'}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Total Bets</p>
            <p className="text-lg font-bold text-gray-900">{game.totalBets || 0}</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4">
        <Button
          onClick={updateGameDuration}
          variant="outline"
          className="flex items-center space-x-2"
        >
          <Timer className="h-4 w-4" />
          <span>Update Duration</span>
        </Button>

        <Button
          onClick={toggleBetting}
          variant="outline"
          className={`flex items-center space-x-2 ${
            game.bettingEnabled !== false
              ? 'border-red-500 text-red-600 hover:bg-red-50'
              : 'border-green-500 text-green-600 hover:bg-green-50'
          }`}
        >
          {game.bettingEnabled !== false ? (
            <>
              <Lock className="h-4 w-4" />
              <span>Disable Betting</span>
            </>
          ) : (
            <>
              <Unlock className="h-4 w-4" />
              <span>Enable Betting</span>
            </>
          )}
        </Button>

        <Button
          onClick={setInitialFunds}
          className="bg-green-600 hover:bg-green-700"
        >
          Set Initial Funds
        </Button>

        <Button
          onClick={endGame}
          className="bg-red-600 hover:bg-red-700"
        >
          End Game
        </Button>
      </div>

      {/* Image Edit Dialog */}
      {editingImage && (
        <ImageEditDialog
          open={!!editingImage}
          onOpenChange={(open) => !open && setEditingImage(null)}
          currentUrl={editingImage.currentUrl}
          onSave={handleImageEdit}
          title={`Edit ${
            editingImage.type === 'banner'
              ? 'Banner'
              : editingImage.type === 'team1'
              ? 'Team 1'
              : 'Team 2'
          } Image`}
        />
      )}
    </div>
  );
}
