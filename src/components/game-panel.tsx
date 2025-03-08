import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dice1 as Dice, Binary as Bingo, Swords, Hand as HandRock } from 'lucide-react';
import { Lucky2Game } from '@/components/games/lucky2/lucky2-game';
import { BingoGame } from '@/components/games/bingo/bingo-game';
import { RpsGame } from '@/components/games/rps/rps-game';
import React from 'react';

interface Props {
  setError: (error: string) => void;
  setMessage: (message: string) => void;
}

interface GameStatus {
  lucky2: boolean;
  bingo: boolean;
}

export function GamePanel() {
  const { user } = useAuthStore();
  const [gameStatus, setGameStatus] = useState<GameStatus>({
    lucky2: false,
    bingo: false
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedGame, setSelectedGame] = useState<'lucky2' | 'bingo' | 'versus' | 'rps'>('lucky2');

  useEffect(() => {
    // Listen to Lucky2 game status
    const unsubLucky2 = onSnapshot(doc(db, 'gameRounds', 'lucky2Round'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setGameStatus(prev => ({
          ...prev,
          lucky2: data.status === 'open'
        }));
      }
    });

    // Listen to Bingo game status
    const unsubBingo = onSnapshot(doc(db, 'gameRounds', 'bingoRound'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setGameStatus(prev => ({
          ...prev,
          bingo: data.status === 'open'
        }));
      }
    });

    return () => {
      unsubLucky2();
      unsubBingo();
    };
  }, []);

  const games = [
    {
      id: 'lucky2',
      name: 'Lucky2',
      icon: Dice,
      color: 'from-yellow-400 via-orange-400 to-red-400',
      description: 'Pick your lucky numbers',
      status: gameStatus.lucky2 ? 'open' : 'closed'
    },
    {
      id: 'bingo',
      name: 'Bingo',
      icon: Bingo,
      color: 'from-blue-400 via-indigo-400 to-purple-400',
      description: 'Classic bingo game',
      status: gameStatus.bingo ? 'open' : 'closed'
    },
    {
      id: 'versus',
      name: 'Versus',
      icon: Swords,
      color: 'from-green-400 via-emerald-400 to-teal-400',
      description: 'Team vs Team betting'
    },
    {
      id: 'rps',
      name: 'Rock Paper Scissors',
      icon: HandRock,
      color: 'from-purple-400 via-pink-400 to-red-400',
      description: 'Player vs Player RPS'
    }
  ] as const;

  const renderGameContent = () => {
    switch (selectedGame) {
      case 'lucky2':
        return (
          <Lucky2Game
            gameStatus={gameStatus.lucky2 ? 'open' : 'closed'}
            jackpot={0}
            setError={setError}
            setMessage={setMessage}
          />
        );
      case 'bingo':
        return (
          <BingoGame
            gameStatus={gameStatus.bingo ? 'open' : 'closed'}
            bingoNumbers={[]}
            setError={setError}
            setMessage={setMessage}
          />
        );
      case 'rps':
        return <RpsGame setError={setError} setMessage={setMessage} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Game Selection Buttons */}
      <div className="grid gap-4 md:grid-cols-4">
        {games.map(({ id, name, icon: Icon, color, description, status }) => (
          <button
            key={id}
            onClick={() => setSelectedGame(id)}
            data-game={id}
            className={`group relative overflow-hidden rounded-xl p-6 shadow-lg transition-all hover:shadow-xl ${
              selectedGame === id
                ? `bg-gradient-to-br ${color} text-white`
                : `bg-gradient-to-br from-${color.split('-')[1]}-50 via-${color.split('-')[3]}-50 to-${color.split('-')[5]}-50 text-gray-700 hover:from-${color.split('-')[1]}-100 hover:via-${color.split('-')[3]}-100 hover:to-${color.split('-')[5]}-100`
            }`}
          >
            <div className="relative z-10 flex items-center space-x-4">
              <Icon className={`h-12 w-12 ${selectedGame === id ? 'text-white' : `text-${color.split('-')[1]}-500`}`} />
              <div>
                <h3 className="text-xl font-bold">{name}</h3>
                <p className="mt-1 text-sm opacity-90">{description}</p>
                {status && (
                  <span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-medium ${
                    status === 'open' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {status === 'open' ? 'LIVE' : 'Closed'}
                  </span>
                )}
              </div>
            </div>
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.2),transparent)] opacity-70" />
          </button>
        ))}
      </div>

      {/* Game Content */}
      <div className="mt-8">
        {renderGameContent()}
      </div>

      {/* Error and Message Display */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {message && (
        <div className="rounded-md bg-green-50 p-4">
          <p className="text-sm text-green-700">{message}</p>
        </div>
      )}
    </div>
  );
}