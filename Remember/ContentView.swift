//
//  ContentView.swift
//  Remember
//
//  Created by Ajay Sehmbi on 2025-08-19.
//

import SwiftUI

struct Item: Identifiable, Hashable {
    let name: String
    let id = UUID()
}


struct ContentView: View {
    @State private var columnVisibility = NavigationSplitViewVisibility.all
    private var sort_by = [
        Item(name: "Images"),
        Item(name: "PDFs"),
        Item(name: "Text"),
        Item(name: "Links"),
    ]
    
    let items = [
            "Short", "A bit longer", "Tiny", "Massiveeeee text item",
            "Medium", "Mini"
        ]


    @State private var multiSelection = Set<Item.ID>()
    
    @State private var search_text = ""
        
        var body: some View {
            NavigationSplitView(columnVisibility: $columnVisibility) {
                Text("Sort")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading)
                    .foregroundStyle(.gray)
                List(sort_by, selection: $multiSelection) { item in
                    Text(item.name)
                }
                .navigationTitle("Sort")
                .toolbar {
                }
                
                Text("\(multiSelection.count) selections")
            } detail: {
                ZStack {
                    TextField("Search", text: $search_text)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .frame(width: 200)
                                        
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            }
        }
}

#Preview {
    ContentView()
}
