/**
 * AI Configuration
 * 
 * Centralized configuration for Phase 2 AI features:
 * - RAG (Retrieval-Augmented Generation)
 * - Semantic Memory
 * - Observability with LangSmith
 */

export const AI_CONFIG = {
  /**
   * RAG (Retrieval-Augmented Generation) Configuration
   */
  rag: {
    // Enable/disable RAG feature
    enabled: import.meta.env.VITE_ENABLE_RAG !== 'false',
    
    // Maximum number of documents to retrieve per query
    maxDocuments: 3,
    
    // Minimum similarity score (0-1) for document retrieval
    minSimilarity: 0.7,
    
    // Embedding model to use
    embeddingModel: 'text-embedding-004',
  },

  /**
   * Semantic Memory Configuration
   */
  semanticMemory: {
    // Enable/disable semantic memory feature
    enabled: import.meta.env.VITE_ENABLE_SEMANTIC_MEMORY !== 'false',
    
    // Maximum number of interactions to store
    maxInteractions: 1000,
    
    // Maximum number of similar interactions to retrieve
    maxContextResults: 3,
    
    // Minimum similarity score for memory retrieval
    minSimilarity: 0.75,
  },

  /**
   * Entity Memory Configuration
   */
  entityMemory: {
    // Enable/disable entity memory feature
    enabled: import.meta.env.VITE_ENABLE_ENTITY_MEMORY !== 'false',
    
    // Thresholds for expertise level classification
    expertiseThresholds: {
      beginner: 5,      // < 5 successful interactions
      intermediate: 20, // 5-20 successful interactions
      advanced: 20,     // > 20 successful interactions
    },
    
    // Number of failures before marking as struggling area
    strugglingThreshold: 3,
  },

  /**
   * Observability Configuration (LangSmith)
   */
  observability: {
    // Enable/disable LangSmith tracing (requires API key)
    enabled: !!import.meta.env.VITE_LANGSMITH_API_KEY,
    
    // LangSmith API key
    apiKey: import.meta.env.VITE_LANGSMITH_API_KEY,
    
    // LangSmith project name
    project: import.meta.env.VITE_LANGSMITH_PROJECT || 'lyriclens-agent',
    
    // Enable verbose logging
    verbose: import.meta.env.DEV,
  },

  /**
   * Performance Monitoring Configuration
   */
  performance: {
    // Enable/disable performance monitoring
    enabled: true,
    
    // Alert thresholds
    thresholds: {
      maxResponseTime: 3000,      // 3 seconds
      minSuccessRate: 0.85,       // 85%
      minSatisfaction: 3.5,       // 3.5/5
      minKnowledgeUsage: 0.80,    // 80%
      minMemoryHitRate: 0.60,     // 60%
    },
    
    // Number of recent interactions to track
    recentInteractionsLimit: 100,
  },
};

/**
 * Log configuration status on startup
 */
export function logAIConfigStatus(): void {
  console.log('[AI Config] Phase 2 Features:');
  console.log(`  RAG: ${AI_CONFIG.rag.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`  Semantic Memory: ${AI_CONFIG.semanticMemory.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`  Entity Memory: ${AI_CONFIG.entityMemory.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`  Observability: ${AI_CONFIG.observability.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  
  if (AI_CONFIG.observability.enabled) {
    console.log(`  LangSmith Project: ${AI_CONFIG.observability.project}`);
  }
}
