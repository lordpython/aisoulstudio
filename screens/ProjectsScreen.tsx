/**
 * Projects Screen - User's Project Dashboard
 *
 * Displays all user projects in a grid with:
 * - Search and filter capabilities
 * - Create new project options
 * - Recent projects section
 * - Favorite projects section
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Folder,
  Video,
  Film,
  AudioWaveform,
  Star,
  Clock,
  Grid3X3,
  List,
  SortAsc,
  SortDesc,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';
import { cn } from '@/lib/utils';
import { Header } from '@/components/layout/Header';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  listUserProjects,
  deleteProject,
  toggleFavorite,
  createProject,
  type Project,
  type ProjectType,
} from '@/services/projectService';
import { useAuth } from '@/hooks/useAuth';

type SortField = 'updatedAt' | 'createdAt' | 'title';
type SortOrder = 'asc' | 'desc';
type FilterType = 'all' | ProjectType;
type ViewMode = 'grid' | 'list';

const CREATE_OPTIONS: Array<{
  type: ProjectType;
  icon: typeof Video;
  titleKey: string;
  color: string;
}> = [
  {
    type: 'production',
    icon: Video,
    titleKey: 'projects.createVideo',
    color: 'from-violet-500 to-purple-600',
  },
  {
    type: 'story',
    icon: Film,
    titleKey: 'projects.createStory',
    color: 'from-amber-500 to-orange-600',
  },
  {
    type: 'visualizer',
    icon: AudioWaveform,
    titleKey: 'projects.createVisualizer',
    color: 'from-cyan-500 to-blue-600',
  },
];

export default function ProjectsScreen() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const mainContentRef = useRef<HTMLElement>(null);

  // State
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isCreating, setIsCreating] = useState(false);

  // Check authentication
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Redirect to sign in if not authenticated (only after auth check completes)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/signin', { state: { from: location.pathname } });
    }
  }, [authLoading, isAuthenticated, navigate, location]);

  // Focus main content on navigation
  useEffect(() => {
    const timer = setTimeout(() => {
      mainContentRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Load projects (only when authenticated)
  useEffect(() => {
    async function loadProjects() {
      if (!isAuthenticated) return;

      setIsLoading(true);
      setError(null);

      try {
        const userProjects = await listUserProjects(100);
        setProjects(userProjects);
      } catch (err) {
        console.error('[ProjectsScreen] Failed to load projects:', err);
        setError(t('projects.loadError') || 'Failed to load projects');
      } finally {
        setIsLoading(false);
      }
    }

    loadProjects();
  }, [isAuthenticated, t]);

  // Filtered and sorted projects
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.topic?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    if (filterType !== 'all') {
      result = result.filter((p) => p.type === filterType);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;

      if (sortField === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortField === 'createdAt') {
        comparison = a.createdAt.getTime() - b.createdAt.getTime();
      } else {
        comparison = a.updatedAt.getTime() - b.updatedAt.getTime();
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [projects, searchQuery, filterType, sortField, sortOrder]);

  // Recent projects (last 5 accessed)
  const recentProjects = useMemo(() => {
    return [...projects]
      .filter((p) => p.lastAccessedAt)
      .sort((a, b) => {
        const aTime = a.lastAccessedAt?.getTime() || 0;
        const bTime = b.lastAccessedAt?.getTime() || 0;
        return bTime - aTime;
      })
      .slice(0, 5);
  }, [projects]);

  // Favorite projects
  const favoriteProjects = useMemo(() => {
    return projects.filter((p) => p.isFavorite);
  }, [projects]);

  // Handlers
  const handleCreateProject = async (type: ProjectType) => {
    setIsCreating(true);

    try {
      const title =
        type === 'production'
          ? 'New Video'
          : type === 'story'
            ? 'New Story'
            : 'New Visualizer';

      const project = await createProject({
        title,
        type,
      });

      if (project) {
        // Navigate to the appropriate screen with the new project
        const routes: Record<ProjectType, string> = {
          production: '/studio?mode=video',
          story: '/studio?mode=story',
          visualizer: '/visualizer',
        };

        const route = routes[type];
        const separator = route.includes('?') ? '&' : '?';
        navigate(`${route}${separator}projectId=${project.id}`);
      }
    } catch (err) {
      console.error('[ProjectsScreen] Failed to create project:', err);
      setError(t('projects.createError') || 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    const success = await deleteProject(projectId);
    if (success) {
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    }
  };

  const handleToggleFavorite = async (projectId: string) => {
    const success = await toggleFavorite(projectId);
    if (success) {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, isFavorite: !p.isFavorite } : p
        )
      );
    }
  };

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
          <p className="text-white/60">{t('projects.loading') || 'Loading projects...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden flex flex-col">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-[128px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col flex-1">
        {/* Header */}
        <div className="p-4 md:p-6">
          <Header />
        </div>

        {/* Main Content */}
        <main
          id="main-content"
          ref={mainContentRef}
          className="flex-1 px-4 md:px-6 pb-6 overflow-auto"
          tabIndex={-1}
          aria-label={t('projects.title') || 'My Projects'}
        >
          <div className="max-w-7xl mx-auto">
            {/* Page Title & Create Button */}
            <div
              className={cn(
                'flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6',
                isRTL && 'sm:flex-row-reverse'
              )}
            >
              <div className={cn(isRTL && 'text-right')}>
                <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                  <Folder className="w-8 h-8 text-violet-400" />
                  {t('projects.title') || 'My Projects'}
                </h1>
                <p className="text-white/60 mt-1">
                  {projects.length} {projects.length === 1 ? 'project' : 'projects'}
                </p>
              </div>

              {/* Create New Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    disabled={isCreating}
                    className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                  >
                    {isCreating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    {t('projects.create') || 'Create New'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {CREATE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                      <DropdownMenuItem
                        key={option.type}
                        onClick={() => handleCreateProject(option.type)}
                        className="cursor-pointer"
                      >
                        <div
                          className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center mr-3',
                            'bg-gradient-to-br',
                            option.color
                          )}
                        >
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        {t(option.titleKey) || option.type}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Error Display */}
            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                {error}
              </div>
            )}

            {/* Show Recent & Favorites if there are projects */}
            {projects.length > 0 && (
              <>
                {/* Favorites Section */}
                {favoriteProjects.length > 0 && (
                  <section className="mb-8">
                    <h2
                      className={cn(
                        'text-lg font-semibold mb-4 flex items-center gap-2',
                        isRTL && 'flex-row-reverse'
                      )}
                    >
                      <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                      {t('projects.favorites') || 'Favorites'}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      <AnimatePresence mode="popLayout">
                        {favoriteProjects.slice(0, 4).map((project) => (
                          <ProjectCard
                            key={project.id}
                            project={project}
                            onDelete={handleDeleteProject}
                            onToggleFavorite={handleToggleFavorite}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </section>
                )}

                {/* Recent Section */}
                {recentProjects.length > 0 && (
                  <section className="mb-8">
                    <h2
                      className={cn(
                        'text-lg font-semibold mb-4 flex items-center gap-2',
                        isRTL && 'flex-row-reverse'
                      )}
                    >
                      <Clock className="w-5 h-5 text-blue-400" />
                      {t('projects.recent') || 'Recent'}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                      <AnimatePresence mode="popLayout">
                        {recentProjects.map((project) => (
                          <ProjectCard
                            key={project.id}
                            project={project}
                            onDelete={handleDeleteProject}
                            onToggleFavorite={handleToggleFavorite}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </section>
                )}
              </>
            )}

            {/* All Projects Section */}
            <section>
              <div
                className={cn(
                  'flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4',
                  isRTL && 'sm:flex-row-reverse'
                )}
              >
                <h2
                  className={cn(
                    'text-lg font-semibold flex items-center gap-2',
                    isRTL && 'flex-row-reverse'
                  )}
                >
                  <FolderOpen className="w-5 h-5 text-white/60" />
                  {t('projects.allProjects') || 'All Projects'}
                </h2>

                {/* Filters & Search */}
                <div
                  className={cn(
                    'flex flex-wrap items-center gap-2',
                    isRTL && 'flex-row-reverse'
                  )}
                >
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <Input
                      type="text"
                      placeholder={t('projects.search') || 'Search...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 w-48 bg-white/5 border-white/10"
                    />
                  </div>

                  {/* Type Filter */}
                  <Select
                    value={filterType}
                    onValueChange={(value) => setFilterType(value as FilterType)}
                  >
                    <SelectTrigger className="w-32 bg-white/5 border-white/10">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="production">Video</SelectItem>
                      <SelectItem value="story">Story</SelectItem>
                      <SelectItem value="visualizer">Visualizer</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Sort */}
                  <Select
                    value={sortField}
                    onValueChange={(value) => setSortField(value as SortField)}
                  >
                    <SelectTrigger className="w-32 bg-white/5 border-white/10">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="updatedAt">Last updated</SelectItem>
                      <SelectItem value="createdAt">Created</SelectItem>
                      <SelectItem value="title">Title</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Sort Order */}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={toggleSortOrder}
                    className="bg-white/5 border-white/10"
                  >
                    {sortOrder === 'desc' ? (
                      <SortDesc className="w-4 h-4" />
                    ) : (
                      <SortAsc className="w-4 h-4" />
                    )}
                  </Button>

                  {/* View Mode */}
                  <div className="flex rounded-lg border border-white/10 overflow-hidden">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setViewMode('grid')}
                      className={cn(
                        'rounded-none',
                        viewMode === 'grid' && 'bg-white/10'
                      )}
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setViewMode('list')}
                      className={cn(
                        'rounded-none',
                        viewMode === 'list' && 'bg-white/10'
                      )}
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Projects Grid/List */}
              {filteredProjects.length > 0 ? (
                <div
                  className={cn(
                    viewMode === 'grid'
                      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                      : 'flex flex-col gap-2'
                  )}
                >
                  <AnimatePresence mode="popLayout">
                    {filteredProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onDelete={handleDeleteProject}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-16 text-center"
                >
                  {searchQuery || filterType !== 'all' ? (
                    <>
                      <Search className="w-12 h-12 mx-auto text-white/20 mb-4" />
                      <p className="text-white/60">
                        {t('projects.noResults') || 'No projects found'}
                      </p>
                      <p className="text-white/40 text-sm mt-1">
                        {t('projects.tryDifferentSearch') ||
                          'Try a different search or filter'}
                      </p>
                    </>
                  ) : (
                    <>
                      <Folder className="w-16 h-16 mx-auto text-white/20 mb-4" />
                      <p className="text-white/60 text-lg mb-2">
                        {t('projects.empty') || 'No projects yet'}
                      </p>
                      <p className="text-white/40 text-sm mb-6">
                        {t('projects.emptyHint') ||
                          'Create your first project to get started'}
                      </p>
                      <div className="flex justify-center gap-3">
                        {CREATE_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          return (
                            <Button
                              key={option.type}
                              variant="outline"
                              onClick={() => handleCreateProject(option.type)}
                              className="bg-white/5 border-white/10 hover:bg-white/10"
                            >
                              <Icon className="w-4 h-4 mr-2" />
                              {t(option.titleKey) || option.type}
                            </Button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
