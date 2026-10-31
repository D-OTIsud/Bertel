import {portalPhotoDraft,mergePortalPublishedPhotos,buildPortalPhotoSubmission} from './portal-photos';
import {portalModules} from '../features/portal/__fixtures__/portal-fixtures';
const UPLOAD='00000000-0000-4000-a000-000000008404';
function media(){return portalModules().media;}
function canonical(id:string,patch={}){return {...portalPhotoDraft({id,title:id,width:1800,height:1200},'Photographe',null,media()),id,portalUploadId:undefined,isPublished:true,visibility:'public',url:`https://example.test/${id}.jpg`,tags:['facade'],rightsExpiresAt:'2027-12-31',...patch};}
test('le serveur reçoit seulement les dépôts enregistrés et leur crédit, jamais une URL choisie par le partenaire',()=>{
 const baseline=media(),draft={...baseline,objectItems:[canonical('old'),portalPhotoDraft({id:UPLOAD,title:'Nouvelle photo',width:1800,height:1200},'Auteur',null,baseline)]};
 draft.objectItems[1].url='https://forged.test/unsafe.jpg';
 const result=buildPortalPhotoSubmission('HOT1',baseline,draft);
 expect(result.payload).toEqual({additions:[{upload_id:UPLOAD,credit:'Auteur',replace_media_id:null}]});
 expect(result.metadata).toEqual(expect.objectContaining({rpc:'publish_portal_photo_additions',section:'media',manual_apply:false}));expect(JSON.stringify(result.payload)).not.toContain('forged');
});
test('le retour d’un retrait ou d’un ordre préserve les ajouts privés, les métadonnées et les autres médias',()=>{
 const base=media(),privatePhoto=canonical('private',{visibility:'private'}),pending=portalPhotoDraft({id:UPLOAD,title:'À relire',width:1800,height:1200},'',null,base);
 const before={...base,objectItems:[canonical('first'),canonical('removed'),privatePhoto,pending],placeItems:[canonical('place',{scope:'place' as const})]};
 const after=mergePortalPublishedPhotos(before,[{id:'first',url:'https://example.test/first.jpg',title:'first',credit:'Photographe',position:1,isMain:true,portalDocumentId:null}]);
 expect(after.objectItems.map(item=>item.id)).toEqual(['private',`portal-photo:${UPLOAD}`,'first']);expect(after.objectItems[2]).toMatchObject({tags:['facade'],rightsExpiresAt:'2027-12-31',width:'1800'});expect(after.objectItems[1]).toBe(pending);expect(after.placeItems).toBe(before.placeItems);
});
test('une photo approuvée remplace sa copie de brouillon et conserve les autres ajouts en attente',()=>{
 const base=media(),pending=portalPhotoDraft({id:UPLOAD,title:'En cours',width:1800,height:1200},'',null,base),other=portalPhotoDraft({id:'other-upload',title:'Autre ajout',width:1800,height:1200},'',null,base);
 const after=mergePortalPublishedPhotos({...base,objectItems:[pending,other]},[{id:'canonical',url:'https://example.test/approved.jpg',title:'Publiée',credit:'',position:1,isMain:true,portalDocumentId:UPLOAD}]);
 expect(after.objectItems.map(item=>item.id)).toEqual(['portal-photo:other-upload','canonical']);expect(after.objectItems[1].portalUploadId).toBeUndefined();
});
test('un échec de lecture de la galerie interdit de préparer l’envoi depuis une liste vide',()=>{
 const base=media(),draft={...base,objectItems:[portalPhotoDraft({id:UPLOAD,title:'Nouvelle',width:1,height:1},'',null,base)]};
 expect(()=>buildPortalPhotoSubmission('HOT1',{...base,unavailableReason:'Load failed'},draft)).toThrow();
});
