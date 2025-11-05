import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db';
import { links } from '../db/schema';
import { eq, desc, sql, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { PostgresError } from 'postgres';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { r2 } from '../lib/r2';
import { env } from '../env';

export async function appRoutes(app: FastifyInstance) {

  /**
   * Rota de Redirecionamento Direto (para navegação)
   * GET /:code
   * Redireciona diretamente para a URL original
   */
  app.get('/:code', async (request, reply) => {
    const getLinkSchema = z.object({
      code: z.string().min(3),
    });

    const { code } = getLinkSchema.parse(request.params);

    const link = await db.query.links.findFirst({
      where: eq(links.code, code),
    });

    if (!link) {
      return reply.status(404).send({ message: 'Link not found' });
    }

    // Incrementa o contador de acessos
    await db
      .update(links)
      .set({
        access_count: sql`${links.access_count} + 1`,
      })
      .where(eq(links.id, link.id));

    // Redireciona para a URL original
    return reply.redirect(link.original_url, 301);
  });

  /**
   * Rota da API para obter dados do link (sem redirect)
   * GET /api/links/:code
   * Retorna os dados do link em JSON
   */
  app.get('/api/links/:code', async (request, reply) => {
    const getLinkSchema = z.object({
      code: z.string().min(3),
    });

    const { code } = getLinkSchema.parse(request.params);

    const link = await db.query.links.findFirst({
      where: eq(links.code, code),
    });

    if (!link) {
      return reply.status(404).send({ message: 'Link not found' });
    }

    // Retorna apenas os dados, sem incrementar contador nem redirecionar
    return reply.send({
      id: link.id,
      code: link.code,
      original_url: link.original_url,
      access_count: link.access_count,
      created_at: link.created_at,
      short_url: `${env.CLOUDFLARE_PUBLIC_URL}/${link.code}`,
    });
  });

/**
 * Rota para incrementar contador de visitas
 * POST /api/links/:code/visit
 */
app.post('/api/links/:code/visit', async (request, reply) => {
  const visitLinkSchema = z.object({
    code: z.string().min(3),
  });

  const { code } = visitLinkSchema.parse(request.params);

  // Search by both code AND custom_name (this is important!)
  const link = await db.query.links.findFirst({
    where: or(
      eq(links.code, code),
      // eq(links.custom_name, code) // Also search by custom_name
    ),
  });

  if (!link) {
    return reply.status(404).send({ message: 'Link not found' });
  }

  // Incrementa o contador de acessos
  await db
    .update(links)
    .set({
      access_count: sql`${links.access_count} + 1`,
    })
    .where(eq(links.id, link.id));

  return reply.status(200).send({ success: true });
});

  /**
 * Rota de Criação de Link [cite: 11]
 * POST /links
 */
// ...existing code...

/**
 * Enhanced URL validation function
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    
    // Check if protocol is http or https
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('URL inválida');
    }
    
    // Check if hostname exists and is not empty
    if (!url.hostname || url.hostname.length === 0) {
      return false;
    }
    
    // Check for localhost, IP addresses, or suspicious domains in production
    const suspiciousPatterns = [
      /^localhost$/i,
      /^127\.0\.0\.1$/,
      /^0\.0\.0\.0$/,
      /^192\.168\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^\[::1\]$/, // IPv6 localhost
    ];
    
    // Only block these in production
    if (process.env.NODE_ENV === 'production') {
      if (suspiciousPatterns.some(pattern => pattern.test(url.hostname))) {
        return false;
      }
    }
    
    // Check for valid domain structure (at least one dot for TLD)
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') {
      return false;
    }
    
    // Check hostname length (max 253 characters per RFC)
    if (url.hostname.length > 253) {
      return false;
    }
    
    // Check for double dots or invalid characters
    if (url.hostname.includes('..') || /[<>]/.test(url.hostname)) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Custom Zod schema for URL validation
 */
// ...existing code...

const urlSchema = z.string()
  .min(1, 'URL é obrigatória')
  .max(2048, 'URL muito longa (máximo 2048 caracteres)')
  .refine((url) => {
    // First, try basic URL validation
    try {
      new URL(url);
    } catch {
      return false;
    }
    return true;
  }, 'URL inválida')
  .refine(isValidUrl, 'URL inválida')
  .transform((url) => {
    // Normalize the URL
    try {
      const urlObj = new URL(url);
      // Remove trailing slash from pathname unless it's just "/"
      if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      return urlObj.toString();
    } catch {
      return url;
    }
  });

/**
 * Rota de Criação de Link [cite: 11]
 * POST /links
 */
// ...existing code...

// ...existing code...

app.post('/api/links', async (request, reply) => {
  console.log('Request body:', request.body);

  const createLinkSchema = z.object({
    original_url: urlSchema,
    // O 'code' é opcional, se não vier, geramos um
    code: z.string()
      .min(3, 'Código deve ter pelo menos 3 caracteres')
      .max(50, 'Código muito longo (máximo 50 caracteres)')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Código pode conter apenas letras, números, hífen e underscore')
      .optional(),
    // Novo campo para nome customizado
    custom_name: z.string()
      .min(3, 'Nome personalizado deve ter pelo menos 3 caracteres')
      .max(50, 'Nome personalizado muito longo (máximo 50 caracteres)')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Nome personalizado pode conter apenas letras, números, hífen e underscore')
      .optional(),
  });

  try {
    const { original_url, code: inputCode, custom_name } = createLinkSchema.parse(request.body);

    // remove brev.ly/ from custom_name
    const cleanedCustomName = custom_name?.replace(/^brev\.ly\//, '');

    // Additional validation for cleaned custom name
    if (cleanedCustomName && cleanedCustomName.length < 3) {
      return reply.status(400).send({
        message: 'Nome personalizado deve ter pelo menos 3 caracteres após remover "brev.ly/"',
      });
    }

    // Check for reserved words
    const reservedWords = [
      'api', 'admin', 'www', 'mail', 'ftp', 'localhost', 'dashboard',
      'app', 'mobile', 'web', 'static', 'assets', 'public', 'private',
      'test', 'dev', 'staging', 'prod', 'production', 'beta', 'alpha',
      'help', 'support', 'contact', 'about', 'terms', 'privacy', 'legal'
    ];

    const finalCode = cleanedCustomName || inputCode || nanoid(6);
    
    if (reservedWords.includes(finalCode.toLowerCase())) {
      return reply.status(400).send({
        message: 'Este nome é reservado e não pode ser usado',
      });
    }

    const [newLink] = await db
      .insert(links)
      .values({
        original_url,
        code: finalCode,
      })
      .returning({
        id: links.id,
        code: links.code,
        original_url: links.original_url,
        created_at: links.created_at,
        access_count: links.access_count,
      });

    // Create the response with the short URL constructed manually
    const responseData = {
      ...newLink,
      custom_name: cleanedCustomName || undefined,
      short_url: `${env.CLOUDFLARE_PUBLIC_URL}/${newLink.code}`,
    };

    return reply.status(201).send(responseData);

  } catch (error) {
    console.error('Error in POST /api/links:', error);
    
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
    // Get the first error or provide a default message
    const firstError = error.issues && error.issues.length > 0
      ? error.issues[0]
      : { message: 'Dados inválidos', path: ['unknown'] };
    
    return reply.status(400).send({
      message: firstError.message,
      field: firstError.path.join('.'),
    });
  }

    // Trata erro de violação de constraint (código duplicado) [cite: 13]
    if (error instanceof PostgresError && error.code === '23505') {
      return reply.status(400).send({
        message: 'URL encurtada já existente.',
      });
    }
    
    // Generic error handling
    return reply.status(500).send({ 
      message: 'Erro interno do servidor.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ...existing code...
  /**
   * Rota de Listagem de Links [cite: 16]
   * GET /links
   * Inclui paginação para performance [cite: 27]
   */
  app.get('/api/links', async (request, reply) => {
    const getLinksSchema = z.object({
      page: z.coerce.number().min(1).default(1),
      pageSize: z.coerce.number().min(10).max(100).default(10),
    });

    const { page, pageSize } = getLinksSchema.parse(request.query);

    const allLinks = await db
      .select({
        id: links.id,
        code: links.code,
        original_url: links.original_url,
        access_count: links.access_count,
        created_at: links.created_at,
        short_url: sql<string>`concat(${env.CLOUDFLARE_PUBLIC_URL}::text, '/', ${links.code})`,
      })
      .from(links)
      .orderBy(desc(links.created_at)) // Mais recentes primeiro
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return reply.send(allLinks);
  });
/**
 * Rota para Deletar Link por código
 * DELETE /links/:code
 * Usa o código em vez do ID para ser mais user-friendly
 */
app.delete('/api/links/:code', async (request, reply) => {
  const deleteLinkSchema = z.object({
    code: z.string().min(3),
  });
  
  console.log('Request params:', request.params);
  const { code } = deleteLinkSchema.parse(request.params);

  const [deletedLink] = await db
    .delete(links)
    .where(eq(links.code, code))
    .returning({ id: links.id });

  if (!deletedLink) {
    return reply.status(404).send({ message: 'Link not found' });
  }

  return reply.status(204).send(); // 204 No Content
});

  /**
   * Rota para Exportar CSV [cite: 21, 25, 26, 28]
   * POST /links/export/csv
   */
  app.post('/api/links/export/csv', async (request, reply) => {
    try {
      const allLinks = await db.select().from(links).orderBy(desc(links.created_at));

      if (allLinks.length === 0) {
        return reply.status(400).send({ message: 'No links to export' });
      }

      // 1. Formatar o CSV [cite: 28]
      const csvHeader = 'URL original,URL encurtada,Contagem de acessos,Data de criação\n';
      const csvBody = allLinks.map(link => {
//        const shortUrl = `${env.CLOUDFLARE_PUBLIC_URL}/${link.code}`;
        const shortUrl = `${link.code}`;
        return `${link.original_url},${shortUrl},${link.access_count},${link.created_at.toISOString()}`;
      }).join('\n');

      const csvContent = csvHeader + csvBody;

      // 2. Gerar nome aleatório [cite: 26]
      const fileName = `${randomUUID()}.csv`;

      // 3. Fazer upload para a CDN (R2) 
      await r2.send(
        new PutObjectCommand({
          Bucket: env.CLOUDFLARE_BUCKET,
          Key: fileName,
          Body: Buffer.from(csvContent),
          ContentType: 'text/csv',
        }),
      );

      // 4. Retornar a URL pública
      const publicUrl = `${env.CLOUDFLARE_PUBLIC_URL}/${fileName}`;

      return reply.status(201).send({ csvUrl: publicUrl });

    } catch (error) {
      console.error(error);
      return reply.status(500).send({ message: 'Failed to export CSV' });
    }
  });
}