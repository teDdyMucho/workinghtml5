import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { collection, addDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Trophy, AlertCircle, Coins } from 'lucide-react';

interface Props {
  setError: (error: string) => void;
  setMessage: (message: string) => void;
}

export function HTML5Game({ setError, setMessage }: Props) {
  const { user } = useAuthStore();
  const [score, setScore] = useState(0);
  const [gameActive, setGameActive] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Listen for messages from the game
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle different message types from the game
        switch (data.type) {
          case 'GAME_SCORE':
            setScore(data.score);
            break;
          case 'GAME_OVER':
            handleGameOver(data.score);
            break;
          case 'GAME_START':
            setGameActive(true);
            break;
        }
      } catch (err) {
        console.error('Error processing game message:', err);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [user]);

  const handleGameOver = async (finalScore: number) => {
    if (!user) return;

    try {
      setGameActive(false);

      // Calculate rewards based on score
      const pointsEarned = Math.floor(finalScore / 100); // Adjust this formula as needed
      
      // Update user's points
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        points: increment(pointsEarned)
      });

      // Record the game session
      await addDoc(collection(db, 'transactions'), {
        userId: user.id,
        username: user.username,
        amount: pointsEarned,
        type: 'html5_game_reward',
        description: `Mines Game reward - Score: ${finalScore}`,
        timestamp: new Date(),
        gameScore: finalScore
      });

      setMessage(`Game Over! You earned ${pointsEarned} FBT points!`);

      // Update local user state
      useAuthStore.setState(state => ({
        ...state,
        user: {
          ...state.user!,
          points: (state.user?.points || 0) + pointsEarned
        }
      }));
    } catch (err) {
      setError('Failed to process game rewards');
      console.error(err);
    }
  };

  const sendMessageToGame = (message: any) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify(message),
        '*'
      );
    }
  };

  const startGame = () => {
    sendMessageToGame({ type: 'START_GAME' });
  };

  return (
    <div className="space-y-6">
      {/* Game Header */}
      <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-6 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Trophy className="h-8 w-8" />
            <div>
              <h2 className="text-2xl font-bold">Mines Game</h2>
              <p className="mt-1 text-sm text-purple-100">
                Play and earn FBT points!
              </p>
            </div>
          </div>
          {gameActive && (
            <div className="flex items-center space-x-2 rounded-full bg-white/20 px-4 py-2 backdrop-blur-sm">
              <Coins className="h-5 w-5" />
              <span className="font-bold">Score: {score}</span>
            </div>
          )}
        </div>
      </div>

      {/* Game Container */}
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-black shadow-lg">
        <iframe
          ref={iframeRef}
          src="/src/components/games/html5/MinesZip/index.html"
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay"
        />
      </div>

      {/* Game Controls */}
      <div className="flex justify-center space-x-4">
        <Button
          onClick={startGame}
          className="bg-green-600 hover:bg-green-700"
          disabled={gameActive}
        >
          <Trophy className="mr-2 h-4 w-4" />
          Start Game
        </Button>
      </div>

      {/* Instructions */}
      <div className="rounded-lg bg-blue-50 p-4">
        <div className="flex items-start space-x-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-blue-500" />
          <div>
            <h3 className="font-medium text-blue-900">How to Play</h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-blue-700">
              <li>Click "Start Game" to begin</li>
              <li>Click on tiles to reveal them</li>
              <li>Avoid mines and collect points</li>
              <li>Higher scores earn more FBT points!</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}