import React, { useState } from 'react';
import { Sparkles, Film, Heart, Laugh, Skull, Rocket, Search, Sword } from 'lucide-react';

interface IdeaViewProps {
    initialTopic?: string;
    onGenerate: (topic: string, genre: string) => void;
    isProcessing?: boolean;
}

const GENRES = [
    { id: 'Drama', label: 'Drama', icon: Heart },
    { id: 'Comedy', label: 'Comedy', icon: Laugh },
    { id: 'Thriller', label: 'Thriller', icon: Skull },
    { id: 'Sci-Fi', label: 'Sci-Fi', icon: Rocket },
    { id: 'Mystery', label: 'Mystery', icon: Search },
    { id: 'Action', label: 'Action', icon: Sword },
];

export const IdeaView: React.FC<IdeaViewProps> = ({
    initialTopic = '',
    onGenerate,
    isProcessing = false
}) => {
    const [topic, setTopic] = useState(initialTopic);
    const [genre, setGenre] = useState('Drama');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (topic.trim() && !isProcessing) {
            onGenerate(topic.trim(), genre);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
            <div className="w-full max-w-2xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-white/10 flex items-center justify-center">
                        <Film className="w-8 h-8 text-blue-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">What's Your Story?</h1>
                    <p className="text-zinc-400 text-sm">Enter your story idea and select a genre to get started</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Topic Input */}
                    <div>
                        <label htmlFor="topic-input" className="block text-sm font-medium text-zinc-400 mb-2">
                            Story Idea
                        </label>
                        <textarea
                            id="topic-input"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="e.g., A time traveler accidentally prevents their own birth..."
                            className="w-full h-32 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                            disabled={isProcessing}
                            autoFocus
                        />
                    </div>

                    {/* Genre Selection */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-3">
                            Genre
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {GENRES.map((g) => {
                                const Icon = g.icon;
                                const isSelected = genre === g.id;
                                return (
                                    <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => setGenre(g.id)}
                                        disabled={isProcessing}
                                        className={`
                                            flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all
                                            ${isSelected
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-zinc-800'
                                            }
                                            disabled:opacity-50 disabled:cursor-not-allowed
                                        `}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {g.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={!topic.trim() || isProcessing}
                        className="w-full flex items-center justify-center gap-2 bg-white text-black px-6 py-3 rounded-xl font-bold hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? (
                            <>
                                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5" />
                                Generate Story Outline
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default IdeaView;
