import { SongData, ImagePrompt, GeneratedImage } from '../types';
import { parseSRT } from './srtParser';

export const createTestSongData = (): SongData => {
  console.log('🎵 Creating test song data from public assets...');

  const srtContent = `1
00:00:51,539 --> 00:00:57,289
Oh, you who trick the soul with hopes that fade,

2
00:00:58,709 --> 00:01:04,019
this world is but a shadow and a shade.

3
00:01:05,489 --> 00:01:11,549
You weep for life, yet deep inside you know,

4
00:01:12,659 --> 00:01:16,879
the only peace is found in letting go.

5
00:01:19,439 --> 00:01:24,209
The days are travelers that will not stay.

6
00:01:26,389 --> 00:01:31,459
And happiness is walking a different way.

7
00:01:32,499 --> 00:01:37,709
There is no home awaiting after death,

8
00:01:39,369 --> 00:01:44,489
except the one you built with living breath.

9
00:01:45,959 --> 00:01:51,289
If built with good, a palace you shall find.

10
00:01:52,659 --> 00:01:57,809
If built with sin, you leave all hope behind.

11
00:02:03,819 --> 00:02:10,319
So work for the home where angels guard the gate.

12
00:02:10,819 --> 00:02:16,619
Where the prophet is the neighbor and the rewards are great.

13
00:02:17,769 --> 00:02:23,909
The walls are made of gold, the mortar smells of musk.

14
00:02:24,679 --> 00:02:28,849
A life that never fades into the dusk.

15
00:02:49,439 --> 00:02:54,779
Where are the kings, where is their royal throne?

16
00:02:56,089 --> 00:03:00,819
Where is the glory that the past has known?

17
00:03:03,349 --> 00:03:08,899
How many cities rose beneath the skies,

18
00:03:09,929 --> 00:03:15,009
only to crumble, wither and die?

19
00:03:16,459 --> 00:03:21,069
The cupbearer of death came to their halt,

20
00:03:22,469 --> 00:03:28,689
and poured the wine that ends it for us all.

21
00:03:28,689 --> 00:03:34,519
And now the sands have covered every storm.

22
00:03:36,049 --> 00:03:40,799
The high and low are buried and alone.

23
00:03:42,509 --> 00:03:48,399
Do not trust time, the seconds cut like knives.

24
00:03:50,479 --> 00:03:54,929
A single blink can swallow up our lives.

25
00:04:04,509 --> 00:04:08,589
True nobility is not in gold or birth,

26
00:04:11,109 --> 00:04:15,199
but in the faith you carry on this earth.

27
00:04:17,869 --> 00:04:23,439
Generosity comes first, patience is the key.

28
00:04:24,549 --> 00:04:28,759
A single prayer can set the spirit free.

29
00:04:58,899 --> 00:05:04,999
So work for the home where angels guard the gate.

30
00:05:05,429 --> 00:05:11,179
Where the prophet is the neighbor and the rewards are great.

31
00:05:12,479 --> 00:05:18,509
Its rivers flow with honey and with wine,

32
00:05:19,269 --> 00:05:23,809
for those who seek the mercy of the divine.

33
00:05:26,989 --> 00:05:32,239
This is the garden, eternal and green.

34
00:05:33,489 --> 00:05:37,739
The greatest sight the eyes have ever seen.

35
00:05:40,789 --> 00:05:45,999
And yet my soul will struggle to the end.

36
00:06:04,919 --> 00:06:10,879
I only find the path when I refuse to be my passion's friend.`;

  const parsedSubtitles = parseSRT(srtContent);

  // Map of image filenames to their metadata
  const imageMetadata = [
    { file: 'lyric-art-Intro - Melancholic.png', section: 'Intro', mood: 'Melancholic', time: 0 },
    { file: 'lyric-art-Verse 1 - Somber.png', section: 'Verse 1', mood: 'Somber', time: 51 },
    { file: 'lyric-art-Verse 2 - Contemplative.png', section: 'Verse 2', mood: 'Contemplative', time: 119 },
    { file: 'lyric-art-Bridge 1 - Urgent Caution.png', section: 'Bridge 1', mood: 'Urgent Caution', time: 183 },
    { file: 'lyric-art-Chorus_Outro 1 - Serene Wonder.png', section: 'Chorus_Outro 1', mood: 'Serene Wonder', time: 203 },
    { file: 'lyric-art-Interlude - Ethereal Lament.png', section: 'Interlude', mood: 'Ethereal Lament', time: 229 },
    { file: 'lyric-art-Verse 3 - Grand Melancholy.png', section: 'Verse 3', mood: 'Grand Melancholy', time: 289 },
    { file: 'lyric-art-Bridge 2 - Hopeful Instruction.png', section: 'Bridge 2', mood: 'Hopeful Instruction', time: 298 },
    { file: 'lyric-art-Verse 4 - Solitary Desolation.png', section: 'Verse 4', mood: 'Solitary Desolation', time: 326 },
    { file: 'lyric-art-Outro 2 - Blissful Climax.png', section: 'Outro 2', mood: 'Blissful Climax', time: 340 },
    { file: 'lyric-art-Outro 3 - Resolute Struggle.png', section: 'Outro 3', mood: 'Resolute Struggle', time: 364 }
  ];

  const prompts: ImagePrompt[] = imageMetadata.map((meta, index) => ({
    id: `prompt-test-${index}`,
    text: `A ${meta.mood.toLowerCase()} scene representing the ${meta.section.toLowerCase()} of the song`,
    mood: `${meta.section} - ${meta.mood}`,
    timestamp: formatTimestamp(meta.time),
    timestampSeconds: meta.time
  }));

  const generatedImages: GeneratedImage[] = imageMetadata.map((meta, index) => ({
    promptId: `prompt-test-${index}`,
    imageUrl: `/test_data/${meta.file}`
  }));

  console.log(`✨ Loaded ${prompts.length} test prompts with actual images`);

  return {
    fileName: 'the true Saba.mp3',
    audioUrl: '/test_data/the true Saba.mp3',
    srtContent,
    parsedSubtitles,
    prompts,
    generatedImages
  };
};

const formatTimestamp = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
