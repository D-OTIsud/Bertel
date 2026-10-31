import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {PhotosEditorRubric} from './PhotosEditorRubric';
import {fakeEditor,portalModules} from '../__fixtures__/portal-fixtures';
import {PORTAL_RUBRICS,type BuiltPortalRubric} from '../portal-rubrics';
import * as service from '../../../services/portal-photos';
jest.mock('../../../services/portal-photos',()=>({...jest.requireActual('../../../services/portal-photos'),listMyPortalPhotos:jest.fn(),withdrawPortalPhoto:jest.fn(),reorderPortalPhotos:jest.fn(),uploadPortalPhoto:jest.fn(),getPortalPhotoPreview:jest.fn()}));
const mocked=jest.mocked(service),ID1='00000000-0000-4000-a000-000000008405',ID2='00000000-0000-4000-a000-000000008406';
const photos=[{id:ID1,url:'https://example.test/1.jpg',title:'Façade',credit:'',position:1,isMain:true,portalDocumentId:null},{id:ID2,url:'https://example.test/2.jpg',title:'Terrasse',credit:'',position:2,isMain:false,portalDocumentId:null}];
function setup(){const modules=portalModules(),editor=fakeEditor(modules),onDone=jest.fn();render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><PhotosEditorRubric editor={editor} rubric={{...PORTAL_RUBRICS.find(r=>r.id==='photos')!,state:'filled',readOnlyReason:null} as BuiltPortalRubric} archetype="RES" formKey="photos" onDone={onDone} onCancel={jest.fn()} onDirtyChange={jest.fn()}/></QueryClientProvider>);return{editor,onDone};}
beforeEach(()=>{jest.clearAllMocks();mocked.listMyPortalPhotos.mockResolvedValue(photos);mocked.getPortalPhotoPreview.mockResolvedValue('https://private.test/signed');URL.createObjectURL=jest.fn(()=> 'blob:preview');URL.revokeObjectURL=jest.fn();});
test('le retrait s’applique tout de suite, sans valider ni envoyer un module',async()=>{
 mocked.withdrawPortalPhoto.mockResolvedValue([photos[1]]);const{editor,onDone}=setup();await screen.findByAltText('Façade');await userEvent.click(screen.getByRole('button',{name:/Retirer la photo 1/}));
 await screen.findByText('La photo est retirée de votre fiche.');expect(mocked.withdrawPortalPhoto).toHaveBeenCalledWith(editor.objectId,ID1);expect(editor.mergeSavedModule).toHaveBeenCalled();expect(editor.replaceModule).not.toHaveBeenCalled();expect(onDone).not.toHaveBeenCalled();
});
test('réordonner les photos enregistre les identifiants complets dans le nouvel ordre',async()=>{
 mocked.reorderPortalPhotos.mockResolvedValue([photos[1],photos[0]]);const{editor}=setup();await screen.findByAltText('Façade');await userEvent.click(screen.getByRole('button',{name:'Descendre la photo 1'}));await screen.findByText('L’ordre des photos est enregistré.');expect(mocked.reorderPortalPhotos).toHaveBeenCalledWith(editor.objectId,[ID2,ID1]);expect(editor.replaceModule).not.toHaveBeenCalled();
});
test('un ajout demande les droits de diffusion et reste un dépôt privé à envoyer ensuite',async()=>{
 mocked.uploadPortalPhoto.mockResolvedValue({id:'upload-1',title:'Nouvelle.jpg',width:1800,height:1200});const{editor,onDone}=setup();await screen.findByAltText('Façade');
 const file=new File(['image'],'Nouvelle.jpg',{type:'image/jpeg'});fireEvent.change(screen.getByLabelText('Choisir des photos'),{target:{files:[file]}});
 await userEvent.click(screen.getByRole('button',{name:'Valider'}));expect(await screen.findByRole('alert')).toHaveTextContent('Confirmez que vous avez l’autorisation');expect(mocked.uploadPortalPhoto).not.toHaveBeenCalled();
 await userEvent.click(screen.getByRole('checkbox',{name:/Ces photos sont les miennes/}));fireEvent.change(screen.getByLabelText('Crédit photo (facultatif)'),{target:{value:'Marie Payet'}});await userEvent.click(screen.getByRole('button',{name:'Valider'}));
 await waitFor(()=>expect(onDone).toHaveBeenCalled());expect(mocked.uploadPortalPhoto).toHaveBeenCalledWith(editor.objectId,file,true);expect(jest.mocked(editor.replaceModule).mock.calls[0][1]).toMatchObject({objectItems:expect.arrayContaining([expect.objectContaining({portalUploadId:'upload-1',credit:'Marie Payet',isPublished:false})])});
});
test('si le deuxième dépôt échoue, le réessai conserve le premier sans le téléverser à nouveau',async()=>{
 mocked.uploadPortalPhoto.mockResolvedValueOnce({id:'u1',title:'Une.jpg',width:1800,height:1200}).mockRejectedValueOnce(new Error('Connexion interrompue.')).mockResolvedValueOnce({id:'u2',title:'Deux.jpg',width:1800,height:1200});const{onDone}=setup();await screen.findByAltText('Façade');
 fireEvent.change(screen.getByLabelText('Choisir des photos'),{target:{files:[new File(['a'],'Une.jpg',{type:'image/jpeg'}),new File(['b'],'Deux.jpg',{type:'image/jpeg'})]}});await userEvent.click(screen.getByRole('checkbox',{name:/Ces photos sont les miennes/}));await userEvent.click(screen.getByRole('button',{name:'Valider'}));await screen.findByRole('alert');expect(mocked.uploadPortalPhoto).toHaveBeenCalledTimes(2);expect(onDone).not.toHaveBeenCalled();
 await userEvent.click(screen.getByRole('button',{name:'Valider'}));await waitFor(()=>expect(onDone).toHaveBeenCalled());expect(mocked.uploadPortalPhoto).toHaveBeenCalledTimes(3);expect(mocked.uploadPortalPhoto.mock.calls[2][1].name).toBe('Deux.jpg');
});
