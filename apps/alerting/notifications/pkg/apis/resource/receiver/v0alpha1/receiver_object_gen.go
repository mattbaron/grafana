//
// Code generated by grafana-app-sdk. DO NOT EDIT.
//

package v0alpha1

import (
	"fmt"
	"github.com/grafana/grafana-app-sdk/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"time"
)

// +k8s:openapi-gen=true
type Receiver struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata"`
	Spec              Spec   `json:"spec"`
	Status            Status `json:"status"`
}

func (o *Receiver) GetSpec() any {
	return o.Spec
}

func (o *Receiver) SetSpec(spec any) error {
	cast, ok := spec.(Spec)
	if !ok {
		return fmt.Errorf("cannot set spec type %#v, not of type Spec", spec)
	}
	o.Spec = cast
	return nil
}

func (o *Receiver) GetSubresources() map[string]any {
	return map[string]any{
		"status": o.Status,
	}
}

func (o *Receiver) GetSubresource(name string) (any, bool) {
	switch name {
	case "status":
		return o.Status, true
	default:
		return nil, false
	}
}

func (o *Receiver) SetSubresource(name string, value any) error {
	switch name {
	case "status":
		cast, ok := value.(Status)
		if !ok {
			return fmt.Errorf("cannot set status type %#v, not of type Status", value)
		}
		o.Status = cast
		return nil
	default:
		return fmt.Errorf("subresource '%s' does not exist", name)
	}
}

func (o *Receiver) GetStaticMetadata() resource.StaticMetadata {
	gvk := o.GroupVersionKind()
	return resource.StaticMetadata{
		Name:      o.ObjectMeta.Name,
		Namespace: o.ObjectMeta.Namespace,
		Group:     gvk.Group,
		Version:   gvk.Version,
		Kind:      gvk.Kind,
	}
}

func (o *Receiver) SetStaticMetadata(metadata resource.StaticMetadata) {
	o.Name = metadata.Name
	o.Namespace = metadata.Namespace
	o.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   metadata.Group,
		Version: metadata.Version,
		Kind:    metadata.Kind,
	})
}

func (o *Receiver) GetCommonMetadata() resource.CommonMetadata {
	dt := o.DeletionTimestamp
	var deletionTimestamp *time.Time
	if dt != nil {
		deletionTimestamp = &dt.Time
	}
	// Legacy ExtraFields support
	extraFields := make(map[string]any)
	if o.Annotations != nil {
		extraFields["annotations"] = o.Annotations
	}
	if o.ManagedFields != nil {
		extraFields["managedFields"] = o.ManagedFields
	}
	if o.OwnerReferences != nil {
		extraFields["ownerReferences"] = o.OwnerReferences
	}
	return resource.CommonMetadata{
		UID:               string(o.UID),
		ResourceVersion:   o.ResourceVersion,
		Generation:        o.Generation,
		Labels:            o.Labels,
		CreationTimestamp: o.CreationTimestamp.Time,
		DeletionTimestamp: deletionTimestamp,
		Finalizers:        o.Finalizers,
		UpdateTimestamp:   o.GetUpdateTimestamp(),
		CreatedBy:         o.GetCreatedBy(),
		UpdatedBy:         o.GetUpdatedBy(),
		ExtraFields:       extraFields,
	}
}

func (o *Receiver) SetCommonMetadata(metadata resource.CommonMetadata) {
	o.UID = types.UID(metadata.UID)
	o.ResourceVersion = metadata.ResourceVersion
	o.Generation = metadata.Generation
	o.Labels = metadata.Labels
	o.CreationTimestamp = metav1.NewTime(metadata.CreationTimestamp)
	if metadata.DeletionTimestamp != nil {
		dt := metav1.NewTime(*metadata.DeletionTimestamp)
		o.DeletionTimestamp = &dt
	} else {
		o.DeletionTimestamp = nil
	}
	o.Finalizers = metadata.Finalizers
	if o.Annotations == nil {
		o.Annotations = make(map[string]string)
	}
	if !metadata.UpdateTimestamp.IsZero() {
		o.SetUpdateTimestamp(metadata.UpdateTimestamp)
	}
	if metadata.CreatedBy != "" {
		o.SetCreatedBy(metadata.CreatedBy)
	}
	if metadata.UpdatedBy != "" {
		o.SetUpdatedBy(metadata.UpdatedBy)
	}
	// Legacy support for setting Annotations, ManagedFields, and OwnerReferences via ExtraFields
	if metadata.ExtraFields != nil {
		if annotations, ok := metadata.ExtraFields["annotations"]; ok {
			if cast, ok := annotations.(map[string]string); ok {
				o.Annotations = cast
			}
		}
		if managedFields, ok := metadata.ExtraFields["managedFields"]; ok {
			if cast, ok := managedFields.([]metav1.ManagedFieldsEntry); ok {
				o.ManagedFields = cast
			}
		}
		if ownerReferences, ok := metadata.ExtraFields["ownerReferences"]; ok {
			if cast, ok := ownerReferences.([]metav1.OwnerReference); ok {
				o.OwnerReferences = cast
			}
		}
	}
}

func (o *Receiver) GetCreatedBy() string {
	if o.ObjectMeta.Annotations == nil {
		o.ObjectMeta.Annotations = make(map[string]string)
	}

	return o.ObjectMeta.Annotations["grafana.com/createdBy"]
}

func (o *Receiver) SetCreatedBy(createdBy string) {
	if o.ObjectMeta.Annotations == nil {
		o.ObjectMeta.Annotations = make(map[string]string)
	}

	o.ObjectMeta.Annotations["grafana.com/createdBy"] = createdBy
}

func (o *Receiver) GetUpdateTimestamp() time.Time {
	if o.ObjectMeta.Annotations == nil {
		o.ObjectMeta.Annotations = make(map[string]string)
	}

	parsed, _ := time.Parse(time.RFC3339, o.ObjectMeta.Annotations["grafana.com/updateTimestamp"])
	return parsed
}

func (o *Receiver) SetUpdateTimestamp(updateTimestamp time.Time) {
	if o.ObjectMeta.Annotations == nil {
		o.ObjectMeta.Annotations = make(map[string]string)
	}

	o.ObjectMeta.Annotations["grafana.com/updateTimestamp"] = updateTimestamp.Format(time.RFC3339)
}

func (o *Receiver) GetUpdatedBy() string {
	if o.ObjectMeta.Annotations == nil {
		o.ObjectMeta.Annotations = make(map[string]string)
	}

	return o.ObjectMeta.Annotations["grafana.com/updatedBy"]
}

func (o *Receiver) SetUpdatedBy(updatedBy string) {
	if o.ObjectMeta.Annotations == nil {
		o.ObjectMeta.Annotations = make(map[string]string)
	}

	o.ObjectMeta.Annotations["grafana.com/updatedBy"] = updatedBy
}

func (o *Receiver) Copy() resource.Object {
	return resource.CopyObject(o)
}

func (o *Receiver) DeepCopyObject() runtime.Object {
	return o.Copy()
}

// Interface compliance compile-time check
var _ resource.Object = &Receiver{}

// +k8s:openapi-gen=true
type ReceiverList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata"`
	Items           []Receiver `json:"items"`
}

func (o *ReceiverList) DeepCopyObject() runtime.Object {
	return o.Copy()
}

func (o *ReceiverList) Copy() resource.ListObject {
	cpy := &ReceiverList{
		TypeMeta: o.TypeMeta,
		Items:    make([]Receiver, len(o.Items)),
	}
	o.ListMeta.DeepCopyInto(&cpy.ListMeta)
	for i := 0; i < len(o.Items); i++ {
		if item, ok := o.Items[i].Copy().(*Receiver); ok {
			cpy.Items[i] = *item
		}
	}
	return cpy
}

func (o *ReceiverList) GetItems() []resource.Object {
	items := make([]resource.Object, len(o.Items))
	for i := 0; i < len(o.Items); i++ {
		items[i] = &o.Items[i]
	}
	return items
}

func (o *ReceiverList) SetItems(items []resource.Object) {
	o.Items = make([]Receiver, len(items))
	for i := 0; i < len(items); i++ {
		o.Items[i] = *items[i].(*Receiver)
	}
}

// Interface compliance compile-time check
var _ resource.ListObject = &ReceiverList{}
