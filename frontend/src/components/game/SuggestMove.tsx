import usePersonStore from "../../contexts/auth";
import { useBestMoveStore } from "../../contexts/bestMove.context";
import { useGameStore } from "../../contexts/game.context";
import { getBestMove } from "../../types/utils/stockfish";

const SuggestMoves = () => {
  const { board, isGameStarted } = useGameStore(["board", "isGameStarted"]);
  const user = usePersonStore((state) => state.user);

  const { bestMove, setBestMove, loading, setLoading } = useBestMoveStore([
    "bestMove",
    "setBestMove",
    "loading",
    "setLoading",
  ]);

  const suggestMoves = async () => {
    if (!board) {
      alert("Please enter a valid FEN string.");
      return;
    }

    setLoading(true);
    try {
      const move = await getBestMove(board);
      setBestMove(move);
    } catch (error) {
      console.error("Error analyzing FEN:", error);
    } finally {
      setLoading(false);
    }
  };

  if(!user || user?.role !== "ADMIN") return null;
  if (!isGameStarted) return null;

  return (
    <>
      <button
        onClick={suggestMoves}
        className="text-white border-white border m-2"
      >
        {loading ? "Analyzing..." : "Get Best Move"}
      </button>

      {bestMove && bestMove?.from && bestMove?.to && (
        <div className="mt-4 p-4 bg-green-100 rounded-lg">
          <p className="font-medium text-green-700">
            Suggested Move:{" "}
            <span className="font-bold">
              From {bestMove.from} to {bestMove.to}
            </span>
          </p>
        </div>
      )}
    </>
  );
};

export default SuggestMoves;
