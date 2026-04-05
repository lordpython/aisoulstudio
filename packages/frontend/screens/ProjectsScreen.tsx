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
  Star,
  Clock,
  Grid3X3,
  List,
  SortAsc,
  SortDesc,
  Loader2,
  FolderOpen,
  Sparkles,
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
  listUserProjects,
  deleteProject,
  toggleFavorite,
  type Project,
  type ProjectType,
} from '@/services/project/projectService';
import { useAuth } from '@/hooks/useAuth';
import { BlurFade } from '@/components/motion-primitives/blur-fade';
import { TextShimmer } from '@/components/motion-primitives/text-shimmer';
import { uiLogger } from '@/services/infrastructure/logger';
const log = uiLogger.child('Projects');


type SortField = 'updatedAt' | 'createdAt' | 'title';
type SortOrder = 'asc' | 'desc';
type FilterType = 'all' | ProjectType;
type ViewMode = 'grid' | 'list';

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

  // Check authentication
  const { isAuthenticated, isLoading: authLoading } = useAuth();

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
        log.error('[ProjectsScreen] Failed to load projects:', err);
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
  const handleCreateProject = () => {
    navigate('/projects/new');
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

  // Render loading state — skeleton grid instead of spinner
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Header />
        <div className="flex-1 px-4 md:px-6 pb-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            {/* Title skeleton */}
            <div className="flex items-center justify-between mb-8 mt-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-secondary animate-pulse" />
                <div className="space-y-2">
                  <div className="h-7 w-36 rounded-md bg-secondary animate-pulse" />
                  <div className="h-3 w-20 rounded-md bg-secondary/60 animate-pulse" />
                </div>
              </div>
              <div className="h-9 w-28 rounded-lg bg-secondary animate-pulse" />
            </div>
            {/* Skeleton card grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-secondary/40 overflow-hidden"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="h-36 bg-secondary animate-pulse" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-secondary animate-pulse" />
                    <div className="h-3 w-1/2 rounded bg-secondary/60 animate-pulse" />
                    <div className="h-3 w-1/3 rounded bg-secondary/40 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-center">
              <TextShimmer className="text-sm text-muted-foreground font-editorial" duration={1.5}>
                {t('projects.loading') || 'Loading projects...'}
              </TextShimmer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden flex flex-col">
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-[-10%] left-[10%] w-[50%] h-[50%] rounded-full blur-[160px] mix-blend-screen"
          style={{ backgroundColor: 'oklch(0.70 0.15 190 / 0.08)' }}
        />
        <div
          className="absolute bottom-[-10%] right-[10%] w-[40%] h-[40%] rounded-full blur-[140px] mix-blend-screen"
          style={{ backgroundColor: 'oklch(0.65 0.25 30 / 0.05)' }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col flex-1">
        {/* Header */}
        <Header />

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
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8',
                isRTL && 'sm:flex-row-reverse'
              )}
            >
              <div className={cn(isRTL && 'text-right')}>
                <h1 className="text-2xl md:text-3xl font-display font-bold flex items-center gap-3 text-foreground">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 border border-border flex items-center justify-center">
                    <Folder className="w-5 h-5 text-primary" />
                  </div>
                  {t('projects.title') || 'My Projects'}
                </h1>
                <p className="text-muted-foreground mt-1.5 font-editorial text-sm">
                  {projects.length} {projects.length === 1 ? 'project' : 'projects'}
                </p>
              </div>

              {/* Create New Button */}
              <Button
                onClick={handleCreateProject}
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('projects.create') || 'Create New'}
              </Button>
            </motion.div>

            {/* Error Display */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Show Recent & Favorites if there are projects */}
            {projects.length > 0 && (
              <>
                {/* Favorites Section */}
                {favoriteProjects.length > 0 && (
                  <motion.section
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="mb-10"
                  >
                    <h2
                      className={cn(
                        'text-sm font-editorial font-semibold mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider',
                        isRTL && 'flex-row-reverse'
                      )}
                    >
                      <Star className="w-4 h-4 text-accent fill-accent" />
                      {t('projects.favorites') || 'Favorites'}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      <AnimatePresence mode="popLayout">
                        {favoriteProjects.slice(0, 4).map((project, i) => (
                          <BlurFade key={project.id} delay={i * 0.06} inView>
                            <ProjectCard
                              project={project}
                              onDelete={handleDeleteProject}
                              onToggleFavorite={handleToggleFavorite}
                            />
                          </BlurFade>
                        ))}
                      </AnimatePresence>
                    </div>
                  </motion.section>
                )}

                {/* Recent Section */}
                {recentProjects.length > 0 && (
                  <motion.section
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.15 }}
                    className="mb-10"
                  >
                    <h2
                      className={cn(
                        'text-sm font-editorial font-semibold mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider',
                        isRTL && 'flex-row-reverse'
                      )}
                    >
                      <Clock className="w-4 h-4 text-primary" />
                      {t('projects.recent') || 'Recent'}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                      <AnimatePresence mode="popLayout">
                        {recentProjects.map((project, i) => (
                          <BlurFade key={project.id} delay={i * 0.06} inView>
                            <ProjectCard
                              project={project}
                              onDelete={handleDeleteProject}
                              onToggleFavorite={handleToggleFavorite}
                            />
                          </BlurFade>
                        ))}
                      </AnimatePresence>
                    </div>
                  </motion.section>
                )}
              </>
            )}

            {/* All Projects Section */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div
                className={cn(
                  'flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4',
                  isRTL && 'sm:flex-row-reverse'
                )}
              >
                <h2
                  className={cn(
                    'text-sm font-editorial font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider',
                    isRTL && 'flex-row-reverse'
                  )}
                >
                  <FolderOpen className="w-4 h-4" />
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={t('projects.search') || 'Search...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 w-48 bg-secondary border-border"
                    />
                  </div>

                  {/* Type Filter */}
                  <Select
                    value={filterType}
                    onValueChange={(value) => setFilterType(value as FilterType)}
                  >
                    <SelectTrigger className="w-32 bg-secondary border-border">
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
                    <SelectTrigger className="w-32 bg-secondary border-border">
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
                    className="bg-secondary border-border"
                  >
                    {sortOrder === 'desc' ? (
                      <SortDesc className="w-4 h-4" />
                    ) : (
                      <SortAsc className="w-4 h-4" />
                    )}
                  </Button>

                  {/* View Mode */}
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setViewMode('grid')}
                      className={cn(
                        'rounded-none',
                        viewMode === 'grid' && 'bg-secondary'
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
                        viewMode === 'list' && 'bg-secondary'
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
                    {filteredProjects.map((project, i) => (
                      <BlurFade key={project.id} delay={i * 0.05} inView>
                        <ProjectCard
                          project={project}
                          onDelete={handleDeleteProject}
                          onToggleFavorite={handleToggleFavorite}
                        />
                      </BlurFade>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-20 text-center"
                >
                  {searchQuery || filterType !== 'all' ? (
                    <>
                      <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-secondary border border-border flex items-center justify-center">
                        <Search className="w-7 h-7 text-muted-foreground" />
                      </div>
                      <p className="text-foreground/70 font-editorial">
                        {t('projects.noResults') || 'No projects found'}
                      </p>
                      <p className="text-muted-foreground text-sm mt-1.5">
                        {t('projects.tryDifferentSearch') ||
                          'Try a different search or filter'}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 border border-border flex items-center justify-center">
                        <Sparkles className="w-9 h-9 text-primary/60" />
                      </div>
                      <p className="text-foreground/80 text-lg mb-2 font-display">
                        {t('projects.empty') || 'No projects yet'}
                      </p>
                      <p className="text-muted-foreground text-sm mb-8 max-w-sm mx-auto">
                        {t('projects.emptyHint') ||
                          'Create your first project to get started'}
                      </p>
                      <Button
                        onClick={handleCreateProject}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('projects.create') || 'Create New'}
                      </Button>
                    </>
                  )}
                </motion.div>
              )}
            </motion.section>
          </div>
        </main>
      </div>
    </div>
  );
}
