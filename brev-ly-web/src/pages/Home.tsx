import { FormEvent, useState } from 'react'
import { createShortLink, getLinks, deleteLink, incrementVisitCount } from '../services/apiService'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { IconButton } from '../components/IconButton'
import { Link } from 'lucide-react'

export function Home() {
  const [url, setUrl] = useState('')
  const [customName, setCustomName] = useState('')
  const queryClient = useQueryClient()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: links, isLoading, isError } = useQuery({
    queryKey: ['links'],
    queryFn: getLinks,
  })

  const { mutateAsync: createLinkFn, isPending: isCreatingLink } = useMutation({
    mutationFn: ({ url, name }: { url: string; name?: string }) => createShortLink(url, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['links'] })
    },
  })

  const { mutateAsync: deleteLinkFn, isPending: isDeletingLink } = useMutation({
    mutationFn: deleteLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['links'] })
    },
    onSettled: () => {
      setDeletingId(null)
    },
  })

  async function handleCreateShortLink(event: FormEvent) {
    event.preventDefault()
    if (!url.trim()) return

    try {
      const newLink = await createLinkFn({ 
        url: url.trim(), 
        name: customName.trim() || undefined 
      })
      // Use custom_name if available, otherwise use code
      const displayName = newLink.custom_name || newLink.code
      alert(`Link criado: brev.ly/${displayName}`)
      setUrl('')
      setCustomName('')
    } catch (error) {
      console.error('Erro ao criar o link:', error)
      alert('Não foi possível criar o link.')
    }
  }

  async function handleDeleteLink(id: string) {
    setDeletingId(id)
    try {
      await deleteLinkFn(id)
      alert('Link excluído com sucesso!')
    } catch (error) {
      console.error('Erro ao excluir o link:', error)
      alert('Não foi possível excluir o link.')
    }
  }

  async function handleCopyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      alert('Link copiado para a área de transferência!')
    } catch (err) {
      console.error('Falha ao copiar o texto: ', err)
      alert('Não foi possível copiar o link.')
    }
  }

  // OPTION 1: Go through redirect system (recommended)
  function handleLinkClickWithRedirect(displayName: string) {
    // This will go through your redirect system and increment the counter
    const redirectUrl = `${import.meta.env.VITE_FRONTEND_URL}/${displayName}`
    window.open(redirectUrl, '_blank', 'noopener,noreferrer')
  }

  // OPTION 2: Direct link with manual counter increment
  async function handleLinkClickDirect(originalUrl: string, displayName: string) {
    try {
      // Increment counter manually
      await incrementVisitCount(displayName)
      
      // Refresh the links to show updated count
      queryClient.invalidateQueries({ queryKey: ['links'] })
      
      // Add protocol if missing
      let urlToOpen = originalUrl
      if (!urlToOpen.startsWith('http://') && !urlToOpen.startsWith('https://')) {
        urlToOpen = 'https://' + urlToOpen
      }
      
      // Open original URL directly
      window.open(urlToOpen, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error('Error incrementing visit count:', error)
      // Still open the link even if counter increment fails
      let urlToOpen = originalUrl
      if (!urlToOpen.startsWith('http://') && !urlToOpen.startsWith('https://')) {
        urlToOpen = 'https://' + urlToOpen
      }
      window.open(urlToOpen, '_blank', 'noopener,noreferrer')
    }
  }

  // Debug: Log the links data to see what's being returned
  console.log('Links data:', links)

  // Determine if we should show the side-by-side layout
  const hasLinksToShow = links && links.length > 0


function downloadCSV() {
  if (!links || links.length === 0) {
    alert('Não há links para exportar.')
    return
  }

  // Create CSV headers
  const headers = ['Link Encurtado', 'URL Original', 'Visitas', 'Data de Criação']
  
  // Create CSV rows
  const csvData = links.map(link => {
    const displayName = link.custom_name || link.code
    const workingUrl = `${import.meta.env.VITE_FRONTEND_URL}/${displayName}` // Use the same URL as copy action
    const createdDate = new Date(link.created_at).toLocaleDateString('pt-BR')
    
    return [
      workingUrl, // Changed from shortUrl to workingUrl
      link.original_url,
      link.access_count || 0,
      createdDate
    ]
  })

  // Combine headers and data
  const csvContent = [headers, ...csvData]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n')

  // Create and download the file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `brev-ly-links-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}

return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 text-gray-600 p-4 md:p-8">
      <div className="w-full max-w-7xl mx-auto">
        <header className="text-center my-10 md:my-16">
          <h1 className="text-xl font-bold text-gray-600 flex items-center justify-center gap-2">
            <img src="/link.svg" alt="Link" className="w-6 h-6" />
            <span className="text-brand-base">brev.ly</span>
          </h1>
        </header>
        
        {/* Main content - conditional layout */}
        <div className={hasLinksToShow ? "flex flex-col lg:flex-row gap-8" : "flex justify-center"}>
          {/* Form section */}
          <div className={hasLinksToShow ? "lg:w-1/3 flex-shrink-0" : "w-full max-w-md"}>
            <div className="bg-white p-6 md:p-8 rounded-lg shadow-md">
              <form
                onSubmit={handleCreateShortLink}
                className="flex flex-col gap-4"
              >
                <Input
                  label="Link Original"
                  name="url"
                  type="url"
                  placeholder="https://www.exemplo.com.br"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
                <Input
                  label="Link encurtado"
                  name="customName"
                  type="text"
                  placeholder="brev.ly/"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  required
                />
                <Button
                  type="submit"
                  isLoading={isCreatingLink}
                  className="w-full text-md font-semibold"
                >
                  <Link className="w-4 h-4" />
                  Salvar
                </Button>
              </form>
            </div>
          </div>

          {/* Table section - only show when there are links */}
          {hasLinksToShow && (
            <div className="lg:w-2/3 flex-1">
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                {/* Add CSV Download Button */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-gray-600">Meus Links</h2>
                  <Button
                    variant="secondary"
                    onClick={downloadCSV}
                    className="text-sm group"
                  >
                    <img 
                      src="/download-simple.svg" 
                      alt="Download" 
                      className="w-4 h-4 opacity-50 group-hover:opacity-100 group-active:opacity-100 transition-opacity" 
                    />
                    Baixar CSV
                  </Button>
                </div>
                
                {/* Scrollable container with max height */}
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                  <table className="min-w-full text-left">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Link Encurtado
                        </th>
                        <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                          URL Original
                        </th>
                        <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Visitas
                        </th>
                        <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {links.map((link) => {
                        // Use custom_name if available, otherwise use code
                        const displayName = link.custom_name || link.code
                        const shortUrl = `brev.ly/${displayName}` // For display only
                        const workingUrl = `${import.meta.env.VITE_FRONTEND_URL}/${displayName}` // Actual working URL
                        
                        return (
                          <tr key={link.id}>
                            <td className="px-4 py-4 text-sm font-semibold text-brand-base">
                              <button
                                onClick={() => handleLinkClickWithRedirect(displayName)}
                                className="max-w-xs truncate hover:underline cursor-pointer text-left transition-colors hover:text-brand-dark"
                                title={`Clique para abrir: ${link.original_url} (será redirecionado)`}
                              >
                                {shortUrl}
                              </button>
                            </td>
                            <td className="px-4 py-4 text-sm font-semibold text-gray-600">
                              <div className="max-w-xs truncate" title={link.original_url}>
                                {link.original_url || 'URL não disponível'}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm font-semibold text-gray-600">
                              {link.access_count || 0}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <IconButton
                                  onClick={() => handleCopyToClipboard(workingUrl)}
                                  title="Copiar link"
                                >
                                  <img src="/copy-simple.svg" alt="Copy" className="w-4 h-4" />
                                </IconButton>
                                <IconButton
                                  variant="danger"
                                  onClick={() => handleDeleteLink(link.code)}
                                  isLoading={deletingId === link.code && isDeletingLink}
                                  title="Excluir link"
                                >
                                  <img src="/trash.svg" alt="Delete" className="w-4 h-4" />
                                </IconButton>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Loading and error states - shown below the form when no links */}
        {!hasLinksToShow && (
          <div className="mt-8 flex justify-center">
            <div className="w-full max-w-md">
              {isLoading && (
                <div className="bg-white rounded-lg shadow-md p-8 text-center">
                  <p>Carregando links...</p>
                </div>
              )}
              
              {isError && (
                <div className="bg-white rounded-lg shadow-md p-8 text-center">
                  <p className="text-danger">Ocorreu um erro ao buscar os links.</p>
                </div>
              )}
              
              {links?.length === 0 && !isLoading && (
                <div className="bg-white rounded-lg shadow-md p-10 text-center text-gray-400">
                  <p className="text-md font-semibold">Nenhum link encurtado ainda. Comece a criar o seu!</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}