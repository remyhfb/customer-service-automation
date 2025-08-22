import OpenAI from "openai";
import { storage } from "../storage";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Industry Standard Vector Embeddings Implementation
 * Based on OpenAI best practices and customer support RAG standards
 */
export class ProperVectorEmbeddingsService {
  private embeddingsCache = new Map<string, number[]>();
  
  // Industry standard thresholds for text-embedding-3-small
  private readonly SIMILARITY_THRESHOLDS = {
    HIGH_QUALITY: 0.75,    // Conservative, high-precision
    BALANCED: 0.70,        // Recommended for customer support
    EXPLORATORY: 0.65      // Broad coverage
  };
  
  /**
   * Generate embeddings following OpenAI best practices
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const cacheKey = this.createCacheKey(text);
    
    if (this.embeddingsCache.has(cacheKey)) {
      return this.embeddingsCache.get(cacheKey)!;
    }
    
    try {
      // Industry standard: text-embedding-3-small for cost-effective high quality
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text.substring(0, 8191), // Model's max token limit
        encoding_format: "float"
      });

      const embedding = response.data[0].embedding;
      
      // Cache for performance
      this.embeddingsCache.set(cacheKey, embedding);
      
      return embedding;
      
    } catch (error) {
      console.error('[VECTOR_EMBEDDINGS] Error generating embedding:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
  
  /**
   * Calculate cosine similarity following OpenAI recommendations
   * OpenAI embeddings are normalized, so cosine similarity is optimal
   */
  private calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vector dimensions must match');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    return normA === 0 || normB === 0 ? 0 : dotProduct / (normA * normB);
  }
  
  /**
   * Chunk content following industry best practices
   * 256-512 tokens with 50-100 token overlap
   */
  private chunkContent(content: string, chunkSize: number = 512, overlap: number = 50): string[] {
    const words = content.split(/\s+/);
    const chunks: string[] = [];
    
    for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (chunk.trim().length > 50) { // Minimum chunk size
        chunks.push(chunk.trim());
      }
    }
    
    return chunks;
  }
  
  /**
   * Semantic search with industry standard thresholds
   */
  async semanticSearch(userId: string, query: string, qualityLevel: 'high' | 'balanced' | 'exploratory' = 'balanced'): Promise<{
    results: Array<{
      content: string;
      url: string;
      similarity: number;
      chunk?: string;
    }>;
    threshold: number;
    totalSources: number;
  }> {
    
    const threshold = this.SIMILARITY_THRESHOLDS[
      qualityLevel === 'high' ? 'HIGH_QUALITY' : 
      qualityLevel === 'exploratory' ? 'EXPLORATORY' : 'BALANCED'
    ];
    
    try {
      // Get training content
      const trainingUrls = await storage.getTrainingUrls(userId);
      
      if (!trainingUrls || trainingUrls.length === 0) {
        return { results: [], threshold, totalSources: 0 };
      }
      
      const completedUrls = trainingUrls.filter(url => 
        url.status === 'completed' && 
        url.crawledContent && 
        url.crawledContent.length > 100
      );
      
      if (completedUrls.length === 0) {
        return { results: [], threshold, totalSources: 0 };
      }
      
      console.log(`[VECTOR_SEARCH] Processing ${completedUrls.length} sources with ${qualityLevel} quality (threshold: ${threshold})`);
      
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);
      
      const results: Array<{
        content: string;
        url: string;
        similarity: number;
        chunk?: string;
      }> = [];
      
      // Process each training source
      for (const urlData of completedUrls) {
        if (!urlData.crawledContent) continue;
        
        try {
          // Industry practice: chunk large documents for better semantic matching
          const chunks = urlData.crawledContent.length > 1000 
            ? this.chunkContent(urlData.crawledContent)
            : [urlData.crawledContent];
          
          // Find best matching chunk
          let bestSimilarity = 0;
          let bestChunk = '';
          
          for (const chunk of chunks) {
            const chunkEmbedding = await this.generateEmbedding(chunk);
            const similarity = this.calculateCosineSimilarity(queryEmbedding, chunkEmbedding);
            
            if (similarity > bestSimilarity) {
              bestSimilarity = similarity;
              bestChunk = chunk;
            }
          }
          
          console.log(`[VECTOR_SEARCH] ${urlData.url}: ${bestSimilarity.toFixed(3)} (${bestSimilarity >= threshold ? 'MATCH' : 'SKIP'})`);
          
          // Include if meets threshold
          if (bestSimilarity >= threshold) {
            results.push({
              content: urlData.crawledContent,
              url: urlData.url as string,
              similarity: bestSimilarity,
              chunk: bestChunk !== urlData.crawledContent ? bestChunk : undefined
            });
          }
          
        } catch (error) {
          console.error(`[VECTOR_SEARCH] Error processing ${urlData.url}:`, error instanceof Error ? error.message : String(error));
          continue;
        }
      }
      
      // Sort by similarity (highest first)
      results.sort((a, b) => b.similarity - a.similarity);
      
      console.log(`[VECTOR_SEARCH] Found ${results.length} matches above ${threshold} threshold`);
      
      return {
        results: results.slice(0, 5), // Return top 5 matches (industry standard)
        threshold,
        totalSources: completedUrls.length
      };
      
    } catch (error) {
      console.error('[VECTOR_SEARCH] Search failed:', error instanceof Error ? error.message : String(error));
      return { results: [], threshold, totalSources: 0 };
    }
  }
  
  /**
   * Create cache key from text content
   */
  private createCacheKey(text: string): string {
    return text.substring(0, 100).replace(/\s+/g, '_');
  }
  
  /**
   * Clear cache for memory management
   */
  clearCache(): void {
    this.embeddingsCache.clear();
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; memoryMB: number } {
    const size = this.embeddingsCache.size;
    const memoryMB = (size * 1536 * 4) / (1024 * 1024); // Estimate: 1536 dimensions * 4 bytes per float
    return { size, memoryMB: Math.round(memoryMB * 100) / 100 };
  }
}

export const properVectorService = new ProperVectorEmbeddingsService();